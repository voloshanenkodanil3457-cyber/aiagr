import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/worker.js';
import {issueSessionToken} from '../cloudflare-worker/auth.js';
const env={FIREBASE_PROJECT_ID:'demo-router-tests',TASK_TOKEN_SECRET:'test-only-long-signing-secret'},apiKey='TEST-OPENROUTER-KEY-ALICE',originalFetch=globalThis.fetch;
let keys,jwk,paid=0,lastBody,lastKey,lastRange,status='completed',requestIdOnly=false;
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
async function jwt(uid){const now=Math.floor(Date.now()/1000),a=b64({alg:'RS256',kid:'router-test-key'}),b=b64({aud:env.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,sub:uid,exp:now+3600,iat:now,auth_time:now}),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(a+'.'+b));return a+'.'+b+'.'+Buffer.from(sig).toString('base64url');}
async function call(route,body={},uid='alice',role='user',key=apiKey){const headers={Authorization:'Bearer '+await jwt(uid),'X-Magic-Session':(await issueSessionToken(uid,env,role)).sessionToken};if(key)headers['X-OpenRouter-Key']=key;return worker.fetch(new Request('https://worker.test/openrouter/'+route,{method:'POST',headers,body:JSON.stringify(body)}),env);}
const payload={model:'bytedance/seedance-2.5',prompt:'A scene',duration:8,resolution:'720p',aspect_ratio:'9:16',generate_audio:false,input_references:[{type:'image_url',image_url:{url:'data:image/png;base64,YWJj'}},{type:'video_url',video_url:{url:'https://cdn.test/ref.mp4'}}]};
let task;
before(async()=>{
  keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'router-test-key'};
  globalThis.fetch=async(url,init)=>{
    const u=String(url);if(u.includes('service_accounts/v1/jwk'))return Response.json({keys:[jwk]});
    if(!u.startsWith('https://openrouter.ai/api/v1/'))throw new Error('Unexpected network '+u);
    lastKey=new Headers(init.headers).get('Authorization');if(lastKey!=='Bearer '+apiKey)return Response.json({error:{message:'Invalid API key'}},{status:401});
    if(u.endsWith('/key'))return Response.json({data:{label:'Test',limit:10,usage:2,limit_remaining:8}});
    if(u.endsWith('/videos/models'))return Response.json({data:[{id:payload.model,supported_durations:[4,8],supported_resolutions:['720p'],supported_aspect_ratios:['9:16']}]});
    if(init.method==='POST'){paid++;lastBody=JSON.parse(init.body);return Response.json(requestIdOnly?{generation_id:'diagnostic-not-job-id'}:{id:'job-alice',status:'pending'},{status:202});}
    if(u.endsWith('/content')){lastRange=new Headers(init.headers).get('Range');return new Response('video-bytes',{status:lastRange?206:200,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-10/11','Accept-Ranges':'bytes'}});}
    return Response.json({id:'job-alice',status,unsigned_urls:['https://openrouter.ai/api/v1/videos/job-alice/content'],usage:{cost:.25},...(status==='failed'?{error:'Provider rejected media'}:{})});
  };
});
after(()=>{globalThis.fetch=originalFetch;});
test('key test is read-only and Worker issues a task receipt without revealing the key',async()=>{
  const before=paid;assert.equal((await call('test')).status,200);assert.equal(paid,before);
  const response=await call('submit',{payload});assert.equal(response.status,200);task=await response.json();assert.equal(task.id,'job-alice');assert.ok(task.taskToken);assert.deepEqual(lastBody,payload);
  const decoded=JSON.parse(Buffer.from(task.taskToken.split('.')[0],'base64url'));assert.ok(decoded.resource.sealedKey);assert.ok(!JSON.stringify(decoded).includes(apiKey));
});
test('unauthenticated, cross-user and unsupported requests never submit a paid job',async()=>{
  const before=paid;assert.equal((await worker.fetch(new Request('https://worker.test/openrouter/submit',{method:'POST',body:'{}'}),env)).status,401);
  assert.equal((await call('status',{taskId:task.id,taskToken:task.taskToken},'bob')).status,403);
  assert.equal((await call('submit',{payload:{...payload,duration:30}})).status,400);
  assert.equal((await call('submit',{payload:{...payload,input_references:[{type:'image_url',image_url:{url:'asset://byteplus-asset'}}]}})).status,400);
  assert.equal(paid,before);
});
test('owner polls with its sealed credential after switching providers, without database requests',async()=>{
  const response=await call('status',{taskId:task.id,taskToken:task.taskToken},'alice','user',null);assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'completed');assert.equal(data.usage.cost,.25);assert.equal(lastKey,'Bearer '+apiKey);
});
test('only the owner or a signed superuser can obtain streaming playback',async()=>{
  const body={taskId:task.id,taskToken:task.taskToken};assert.equal((await call('playback',body,'bob','user',null)).status,403);
  assert.equal((await call('status',body,'admin','superuser',null)).status,403);
  for(const [uid,role]of [['alice','user'],['admin','superuser']]){
    const r=await call('playback',body,uid,role,null);assert.equal(r.status,200);const link=await r.json();assert.ok(!link.url.includes(apiKey));
    const media=await worker.fetch(new Request(link.url,{headers:{Range:'bytes=0-10'}}),env);assert.equal(media.status,206);assert.equal(await media.text(),'video-bytes');assert.equal(lastRange,'bytes=0-10');assert.equal(media.headers.get('Cache-Control'),'private, no-store');
    const wrong=link.url.replace('/job-alice?','/job-other?');assert.equal((await worker.fetch(new Request(wrong),env)).status,403);
  }
  assert.equal((await worker.fetch(new Request('https://worker.test/openrouter/media/job-alice?token='+encodeURIComponent(task.taskToken)),env)).status,403);
});
test('unknown submission IDs and explicit provider errors do not manufacture a video task',async()=>{
  requestIdOnly=true;try{const r=await call('submit',{payload});assert.equal(r.status,502);assert.equal((await r.json()).taskToken,undefined);}finally{requestIdOnly=false;}
  assert.equal((await call('test',{},'alice','user','WRONG-KEY')).status,401);
  status='failed';const result=await (await call('status',{taskId:task.id,taskToken:task.taskToken},'alice','user',null)).json();assert.equal(result.error,'Provider rejected media');
});
