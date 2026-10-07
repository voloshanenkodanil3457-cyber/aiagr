import {authenticate,issueTaskToken,verifyTaskToken,issueSessionToken,verifySessionToken} from './auth.js';
import {portraitRoute,servePortraitFile,validatePortraitReferences} from './portraits.js';
import {openRouterRoute,serveOpenRouterMedia} from './openrouter.js';

const BYTEPLUS_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODEL = 'dreamina-seedance-2-5-260628';
function configuredModel(env) {
  const model=String(env.BYTEPLUS_MODEL||'').trim();
  return !model || /^(?:dreamina[-\s])?seedance[-\s]?2[.-]5$/i.test(model) ? DEFAULT_MODEL : model;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGIN || '*').trim();
  const allowed = configured === '*' ? '*' : (configured.split(',').map(x => x.trim()).includes(origin) ? origin : configured.split(',')[0].trim());
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Task-Token,X-Magic-Session,X-OpenRouter-Key,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type':'application/json; charset=utf-8', ...corsHeaders(request, env)}
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function apiHeaders(env) {
  if (!env.ARK_API_KEY) throw new Error('ARK_API_KEY secret is not configured in Cloudflare Worker');
  return {
    'Authorization': `Bearer ${env.ARK_API_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function byteplus(path, init, env) {
  const r = await fetch(BYTEPLUS_BASE + path, {
    ...init,
    headers: {...apiHeaders(env), ...(init?.headers || {})}
  });
  const type = r.headers.get('content-type') || '';
  let body;
  try { body = type.includes('json') ? await r.json() : await r.text(); }
  catch { body = ''; }
  if (!r.ok) {
    const detail = typeof body === 'string' ? body : (body?.error?.message || body?.message || JSON.stringify(body));
    const err = new Error(detail || `BytePlus API ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

function buildGenerationBody(payload = {}, env) {
  const content = [{type:'text', text:String(payload.prompt || '')}];
  if (payload.first_frame_url) content.push({type:'image_url', image_url:{url:payload.first_frame_url}, role:'first_frame'});
  if (payload.last_frame_url) content.push({type:'image_url', image_url:{url:payload.last_frame_url}, role:'last_frame'});
  for (const url of payload.reference_images || []) content.push({type:'image_url', image_url:{url}, role:'reference_image'});
  for (const url of payload.reference_videos || []) content.push({type:'video_url', video_url:{url}, role:'reference_video'});

  const out = {
    model: configuredModel(env),
    content,
    generate_audio: payload.generate_audio !== false,
    watermark: false,
    output_format: payload.output_format || 'mp4'
  };
  if (payload.ratio) out.ratio = payload.ratio;
  if (payload.resolution) out.resolution = payload.resolution;
  if (payload.duration !== undefined && payload.duration !== null && payload.duration !== '') out.duration = Number(payload.duration);
  if (Number.isFinite(Number(payload.seed)) && Number(payload.seed) >= 0) out.seed = Number(payload.seed);
  return out;
}

function validatePayload(p) {
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>32000)fail('Prompt must contain 1–32000 characters');
  if(!Number.isFinite(Number(p.duration))||p.duration<4||p.duration>30)fail('Duration must be 4–30 seconds');
  if(!['480p','720p','1080p'].includes(p.resolution))fail('Unsupported resolution');
  if(!['adaptive','21:9','16:9','4:3','1:1','3:4','9:16'].includes(p.ratio))fail('Unsupported aspect ratio');
  if(p.first_frame_url||p.last_frame_url)fail('Only Omni Reference mode is supported');
  if((p.reference_images&&!Array.isArray(p.reference_images))||(p.reference_videos&&!Array.isArray(p.reference_videos)))fail('Invalid references');
  const refs=[...(p.reference_images||[]),...(p.reference_videos||[])];
  const assetSource=url=>typeof url==='string'&&/^asset:\/\/[a-zA-Z0-9_-]{3,160}$/.test(url);
  const imageSource=url=>typeof url==='string'&&(assetSource(url)||/^https:\/\//.test(url)||/^data:image\/(jpeg|png|webp|bmp|tiff|gif|heic|heif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url));
  if(refs.length>15||(p.reference_images||[]).some(url=>!imageSource(url))||(p.reference_videos||[]).some(url=>typeof url!=='string'||(!url.startsWith('https://')&&!assetSource(url))))fail('Use up to 15 references: HTTPS URLs, Base64 images or approved asset URIs');
  if(JSON.stringify(p).length>60*1024*1024)fail('Reference request exceeds 60 MiB');
}

function extractVideoUrl(task) {
  return task?.content?.video_url || task?.content?.videoUrl || task?.video_url || task?.videoUrl || null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:corsHeaders(request, env)});
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') {
        return json({ok:true, service:'magic-byteplus-worker', model:configuredModel(env)}, 200, request, env);
      }
      if(url.pathname.startsWith('/byteplus/portraits/file/') && request.method==='GET')return await servePortraitFile(request,env);
      if(url.pathname.startsWith('/openrouter/media/')&&request.method==='GET'){
        const response=await serveOpenRouterMedia(request,env),headers=new Headers(response.headers);for(const [k,v]of Object.entries(corsHeaders(request,env)))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
      }

      const uid = await authenticate(request, env);
      if(url.pathname==='/byteplus/session' && request.method==='POST'){
        const profile=await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,{headers:{Authorization:request.headers.get('Authorization')}});
        if(!profile.ok)return json({error:'Account is not a member of this team'},403,request,env);
        const role=(await profile.json())?.fields?.role?.stringValue;
        if(!['user','superuser'].includes(role))return json({error:'Account is not a member of this team'},403,request,env);
        return json(await issueSessionToken(uid,env,role),200,request,env);
      }
      const session=await verifySessionToken(request.headers.get('X-Magic-Session'),uid,env);
      if(url.pathname.startsWith('/openrouter/')&&request.method==='POST')return json(await openRouterRoute(request,env,uid,session),200,request,env);
      if(url.pathname.startsWith('/byteplus/portraits/') && request.method==='POST')return json(await portraitRoute(request,env,uid),200,request,env);

      if (url.pathname === '/byteplus/test' && request.method === 'POST') {
        const data = await byteplus('/contents/generations/tasks?page_num=1&page_size=1', {method:'GET'}, env);
        return json({ok:true, authenticated:true, model:configuredModel(env), modelAccessVerified:false, sampleCount:Array.isArray(data?.items) ? data.items.length : 0}, 200, request, env);
      }

      if (url.pathname === '/byteplus/submit' && request.method === 'POST') {
        const body = await readJson(request);
        const payload = body.payload || body;
        validatePayload(payload);
        await validatePortraitReferences(payload,uid,env);
        const reqBody = buildGenerationBody(payload, env);
        const data = await byteplus('/contents/generations/tasks', {method:'POST', body:JSON.stringify(reqBody)}, env);
        const id = data.id;
        if (!id) return json({error:'Provider did not return a task ID'},502,request,env);
        return json({...data, taskToken:await issueTaskToken(uid,id,env)}, 200, request, env);
      }

      if (url.pathname === '/byteplus/status' && request.method === 'POST') {
        const body = await readJson(request);
        const taskId = String(body.taskId || body.id || '').trim();
        if (!taskId) return json({error:'taskId is required'}, 400, request, env);
        await verifyTaskToken(body.taskToken,uid,taskId,env);
        const data = await byteplus(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, {method:'GET'}, env);
        return json(data, 200, request, env);
      }

      const mediaMatch = url.pathname.match(/^\/byteplus\/media\/([^/]+)$/);
      if (mediaMatch && request.method === 'GET') {
        const taskId = decodeURIComponent(mediaMatch[1]);
        await verifyTaskToken(request.headers.get('X-Task-Token'),uid,taskId,env);
        const task = await byteplus(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, {method:'GET'}, env);
        const remote = extractVideoUrl(task);
        if (!remote) return json({error:'Video URL is not available for this task yet', status:task?.status || null}, 409, request, env);
        const media = await fetch(remote);
        if (!media.ok) return json({error:`Generated video download failed: ${media.status}`}, 502, request, env);
        const headers = new Headers(media.headers);
        for (const [k,v] of Object.entries(corsHeaders(request, env))) headers.set(k,v);
        headers.set('Cache-Control','private, max-age=300');
        return new Response(media.body, {status:200, headers});
      }

      return json({error:'Not found'}, 404, request, env);
    } catch (e) {
      return json({error:e?.message || String(e), detail:e?.body || null}, Number(e?.status) || 500, request, env);
    }
  }
};
