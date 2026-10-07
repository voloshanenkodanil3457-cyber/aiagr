import Providers from '../source/providers.js';
import {issueResourceToken,verifyResourceToken} from './auth.js';
const BASE='https://openrouter.ai/api/v1',encoder=new TextEncoder();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const encode=v=>btoa(String.fromCharCode(...v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=v=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4)),c=>c.charCodeAt(0));
async function encryptionKey(env){
  const secret=env.TASK_TOKEN_SECRET||env.ARK_API_KEY;if(!secret)fail('Set TASK_TOKEN_SECRET in Worker secrets',503);
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode('magic-openrouter-key-v1|'+secret));return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(apiKey,ownerUid,taskId,env){
  const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(ownerUid+'|'+taskId)},await encryptionKey(env),encoder.encode(apiKey));
  return encode(iv)+'.'+encode(new Uint8Array(data));
}
async function unseal(resource,env){
  try{const [iv,data]=resource.sealedKey.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode(resource.ownerUid+'|'+resource.taskId)},await encryptionKey(env),decode(data)));}
  catch{fail('Invalid or outdated video credential receipt',403);}
}
function requestKey(request,env){const key=request.headers.get('X-OpenRouter-Key')||env.OPENROUTER_API_KEY;if(!key||key.length>4096||/[\r\n]/.test(key))fail('OpenRouter API key is required',400);return key;}
async function api(path,key,options={}){
  const response=await fetch(BASE+path,{...options,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'Magic',...options.headers},signal:AbortSignal.timeout(90000)});
  if(!response.ok){let data;try{data=await response.json();}catch{}fail(data?.error?.message||data?.message||`OpenRouter ${response.status}`,response.status);}
  return response.json();
}
let catalog={expiresAt:0,data:[]};
async function models(key){if(catalog.expiresAt<Date.now()){const result=await api('/videos/models',key);catalog={data:result.data||[],expiresAt:Date.now()+15*60000};}return catalog.data;}
function validateBody(body){
  if(body?.model!==Providers.openRouterModel)fail('Only bytedance/seedance-2.5 is configured');
  if(body.input_references&&!Array.isArray(body.input_references))fail('Invalid input_references');
  const refs=body.input_references||[];if(refs.some(r=>!['image_url','video_url'].includes(r?.type)))fail('Unsupported reference type');
  if(body.frame_images?.length)fail('Use Omni Reference mode');
  return Providers.buildOpenRouterRequest({...body,ratio:body.aspect_ratio,reference_images:refs.filter(r=>r.type==='image_url').map(r=>r.image_url?.url),reference_videos:refs.filter(r=>r.type==='video_url').map(r=>r.video_url?.url)});
}
async function owned(body,uid,env,admin=false){
  const resource=await verifyResourceToken(body.taskToken,null,'openrouter-task',env);
  if(resource.taskId!==body.taskId||(!admin&&resource.ownerUid!==uid))fail('This video belongs to another user',403);
  Providers.contentUrl(resource.taskId);return resource;
}
export async function openRouterRoute(request,env,uid,session){
  const path=new URL(request.url).pathname;let body;try{body=await request.json();}catch{body={};}
  if(path==='/openrouter/test'){const result=await api('/key',requestKey(request,env));const d=result.data||{};return {data:{label:d.label,limit:d.limit,usage:d.usage,limit_remaining:d.limit_remaining,is_free_tier:d.is_free_tier}};}
  if(path==='/openrouter/models')return {data:await models(requestKey(request,env))};
  if(path==='/openrouter/submit'){
    const key=requestKey(request,env),payload=validateBody(body.payload),model=(await models(key)).find(m=>m.id===Providers.openRouterModel);Providers.validateCapabilities(payload,model);
    // Validate encryption setup before sending a paid request.
    await encryptionKey(env);
    const result=await api('/videos',key,{method:'POST',body:JSON.stringify(payload)});if(!result.id)fail('Provider did not return a video job ID; check OpenRouter activity before retrying',502);Providers.contentUrl(result.id);
    const resource={ownerUid:uid,taskId:result.id,sealedKey:await seal(key,uid,result.id,env)};
    return {...result,taskToken:await issueResourceToken(uid,'openrouter-task',resource,env)};
  }
  if(path==='/openrouter/status'){const resource=await owned(body,uid,env);return api('/videos/'+encodeURIComponent(resource.taskId),await unseal(resource,env));}
  if(path==='/openrouter/playback'){
    const resource=await owned(body,uid,env,session.role==='superuser'),token=await issueResourceToken(uid,'openrouter-playback',resource,env,1800);
    return {url:new URL('/openrouter/media/'+encodeURIComponent(resource.taskId)+'?token='+encodeURIComponent(token),request.url).href,expiresAt:Date.now()+1800000};
  }
  fail('Not found',404);
}
export async function serveOpenRouterMedia(request,env){
  const url=new URL(request.url),resource=await verifyResourceToken(url.searchParams.get('token'),null,'openrouter-playback',env);
  if(url.pathname!=='/openrouter/media/'+encodeURIComponent(resource.taskId))fail('Playback receipt does not match this video',403);
  const headers={Authorization:'Bearer '+await unseal(resource,env)};if(request.headers.get('Range'))headers.Range=request.headers.get('Range');
  const response=await fetch(Providers.contentUrl(resource.taskId),{headers,signal:AbortSignal.timeout(90000)});if(!response.ok)fail(`Video content is unavailable: OpenRouter ${response.status}`,response.status);
  const out=new Headers();for(const name of ['Content-Type','Content-Length','Content-Range','Accept-Ranges'])if(response.headers.has(name))out.set(name,response.headers.get(name));out.set('Cache-Control','private, no-store');out.set('Referrer-Policy','no-referrer');
  return new Response(response.body,{status:response.status,headers:out});
}
