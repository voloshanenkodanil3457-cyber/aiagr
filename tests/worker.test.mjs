import hfWorker from '../cloudflare-worker/higgsfield-gateway.js';
import kvWorker from '../cloudflare-worker/kv-references.js';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/worker.js';
import {authenticate,issueTaskToken,verifyTaskToken,issueSessionToken} from '../cloudflare-worker/auth.js';
const env={FIREBASE_PROJECT_ID:'demo-magic-tests',ARK_API_KEY:'test-only-provider-secret'},originalFetch=globalThis.fetch;
let lastProviderBody,keys,jwk,providerCalls=0,membershipRole='user',profileReads=0,portraitStatus='Active',requestIdOnly=false;
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(uid='alice',patch={}){
 const now=Math.floor(Date.now()/1000),head=b64({alg:'RS256',kid:'test-key'}),payload=b64({aud:env.FIREBASE_PROJECT_ID,iss:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,sub:uid,exp:now+3600,iat:now,auth_time:now,...patch});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(head+'.'+payload));return head+'.'+payload+'.'+Buffer.from(sig).toString('base64url');
}
before(async()=>{
 keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'};
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('service_accounts/v1/jwk'))return Response.json({keys:[jwk]});
  if(String(url).includes('firestore.googleapis.com')){profileReads++;return membershipRole?Response.json({fields:{role:{stringValue:membershipRole}}}):new Response('',{status:404});}
  if(String(url).includes('ark.ap-southeast-1.byteplusapi.com')){
   const action=new URL(url).searchParams.get('Action');return Response.json({Result:action==='CreateAssetGroup'?{Id:'group-worker'}:action==='CreateAsset'?{Id:'asset-worker'}:{Status:portraitStatus,GroupId:'group-worker',AssetType:'Image'}});
  }
  if(String(url).includes('bytepluses.com')){providerCalls++;if(init?.body)lastProviderBody=JSON.parse(init.body);return Response.json(init?.method==='POST'?(requestIdOnly?{request_id:'not-a-generation-id'}:{id:'task-1'}):{status:'running'});}
  throw new Error('Unexpected network: '+url);
 };
});
after(()=>{globalThis.fetch=originalFetch;});
test('Worker normalizes legacy environment model in health, probe and paid request',async()=>{
 const legacy={...env,BYTEPLUS_MODEL:'seedance-2.5'},model='dreamina-seedance-2-5-260628';
 const health=await worker.fetch(new Request('https://worker.test/health'),legacy);
 assert.equal((await health.json()).model,model);
 const headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',legacy)).sessionToken};
 const probe=await worker.fetch(new Request('https://worker.test/byteplus/test',{method:'POST',headers}),legacy);
 const result=await probe.json();assert.equal(result.model,model);assert.equal(result.modelAccessVerified,false);
 const response=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload:{prompt:'Scene',model:'seedance-2.5',duration:8,resolution:'720p',ratio:'16:9'}})}),legacy);
 assert.equal(response.status,200);assert.equal(lastProviderBody.model,model);
 const endpoint=await worker.fetch(new Request('https://worker.test/health'),{...env,BYTEPLUS_MODEL:' ep-custom-id '});
 assert.equal((await endpoint.json()).model,'ep-custom-id');
});
test('valid signed Firebase tokens accepted; wrong project, expiry and forgery rejected',async()=>{
 const request=jwt=>new Request('https://worker.test',{headers:{Authorization:'Bearer '+jwt}});
 assert.equal(await authenticate(request(await token()),env),'alice');
 await assert.rejects(authenticate(request(await token('alice',{aud:'another-project'})),env));
 await assert.rejects(authenticate(request(await token('alice',{exp:1})),env));
 const valid=await token();await assert.rejects(authenticate(request(valid.slice(0,-6)+'AAAAAA'),env));
 await assert.rejects(authenticate(new Request('https://worker.test'),env));
});
test('task receipt is bound to both user and task ID',async()=>{
 const receipt=await issueTaskToken('alice','task-1',env);
 await verifyTaskToken(receipt,'alice','task-1',env);
 await assert.rejects(verifyTaskToken(receipt,'bob','task-1',env));
 await assert.rejects(verifyTaskToken(receipt,'alice','task-2',env));
 await assert.rejects(verifyTaskToken(null,'alice','task-1',env));
});
test('Worker never calls the paid provider for unauthenticated or cross-user requests',async()=>{
 const before=providerCalls;
 const result=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',body:'{}'}),env);assert.equal(result.status,401);
 const receipt=await issueTaskToken('alice','task-1',env);
 const response=await worker.fetch(new Request('https://worker.test/byteplus/status',{method:'POST',headers:{Authorization:'Bearer '+await token('bob'),'X-Magic-Session':(await issueSessionToken('bob',env)).sessionToken},body:JSON.stringify({taskId:'task-1',taskToken:receipt})}),env);assert.equal(response.status,403);assert.equal(providerCalls,before);
});
test('authenticated submit returns a receipt and allows only its owner to poll',async()=>{
 const jwt=await token(),headers={Authorization:'Bearer '+jwt,'X-Magic-Session':(await issueSessionToken('alice',env)).sessionToken};
 const response=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload:{prompt:'Scene',duration:8,resolution:'1080p',ratio:'16:9',generate_audio:false}})}),env);
 assert.equal(response.status,200);const body=await response.json();assert.ok(body.taskToken);
 const status=await worker.fetch(new Request('https://worker.test/byteplus/status',{method:'POST',headers,body:JSON.stringify({taskId:'task-1',taskToken:body.taskToken})}),env);assert.equal(status.status,200);
});

test('membership checked at session start; submit and status use its receipt without database calls',async()=>{
 const headers={Authorization:'Bearer '+await token()};membershipRole=null;
 const denied=await worker.fetch(new Request('https://worker.test/byteplus/session',{method:'POST',headers}),env);assert.equal(denied.status,403);
 membershipRole='user';const session=await worker.fetch(new Request('https://worker.test/byteplus/session',{method:'POST',headers}),env);assert.equal(session.status,200);
 headers['X-Magic-Session']=(await session.json()).sessionToken;const before=profileReads;
 const response=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload:{prompt:'Scene',duration:8,resolution:'1080p',ratio:'16:9'}})}),env);
 const task=await response.json();assert.equal(response.status,200);
 const status=await worker.fetch(new Request('https://worker.test/byteplus/status',{method:'POST',headers,body:JSON.stringify({taskId:task.id,taskToken:task.taskToken})}),env);assert.equal(status.status,200);assert.equal(profileReads,before);
});

test('Spark images reach the provider as Base64; local video/data references are rejected',async()=>{
 const headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',env)).sessionToken};
 const call=payload=>worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload:{prompt:'Scene',duration:8,resolution:'720p',ratio:'9:16',...payload}})}),env);
 const image='data:image/png;base64,aGVsbG8=';
 assert.equal((await call({reference_images:[image],reference_videos:['https://cdn.example.test/ref.mp4']})).status,200);
 assert.ok(lastProviderBody.content.some(c=>c.image_url?.url===image));
 const before=providerCalls;
 assert.equal((await call({reference_videos:['data:video/mp4;base64,aGVsbG8=']})).status,400);
 assert.equal((await call({reference_images:['blob:local-only']})).status,400);
 assert.equal(providerCalls,before);
});

test('authenticated portrait routes enforce Active and receipt ownership before inference',async()=>{
 const assetsEnv={...env,BYTEPLUS_ACCESS_KEY_ID:'test-ak',BYTEPLUS_SECRET_ACCESS_KEY:'test-sk'};
 const headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',assetsEnv)).sessionToken};
 const call=(route,body,h=headers)=>worker.fetch(new Request('https://worker.test/byteplus/'+route,{method:'POST',headers:h,body:JSON.stringify(body)}),assetsEnv);
 const dbBefore=profileReads;
 const g=await call('portraits/groups/create',{name:'Fictional hero',type:'AIGC'});assert.equal(g.status,200);const group=await g.json();
 const a=await call('portraits/assets/create',{groupToken:group.token,url:'https://photos.test/ai.jpg',name:'Photo'});assert.equal(a.status,200);const asset=await a.json();
 const payload={prompt:'Scene',duration:8,resolution:'720p',ratio:'16:9',reference_images:['asset://asset-worker'],asset_receipts:{'asset-worker':asset.token}};
 const before=providerCalls;portraitStatus='Processing';assert.equal((await call('submit',{payload})).status,409);assert.equal(providerCalls,before);
 portraitStatus='Active';assert.equal((await call('submit',{payload})).status,200);
 assert.equal(lastProviderBody.content[1].image_url.url,'asset://asset-worker');assert.equal(lastProviderBody.asset_receipts,undefined);
 const bob={Authorization:'Bearer '+await token('bob'),'X-Magic-Session':(await issueSessionToken('bob',assetsEnv)).sessionToken};
 const paid=providerCalls;assert.equal((await call('submit',{payload},bob)).status,403);assert.equal(providerCalls,paid);
 assert.equal(profileReads,dbBefore,'portrait registration/status must not query Firestore per photo');
});

test('a provider request ID alone never starts polling as a generation task',async()=>{
 const headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',env)).sessionToken};
 requestIdOnly=true;
 try{const r=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload:{prompt:'Scene',duration:8,resolution:'720p',ratio:'16:9'}})}),env);assert.equal(r.status,502);assert.equal((await r.json()).taskToken,undefined);}
 finally{requestIdOnly=false;}
});

test('local video upload requires membership, serves signed ranges and rejects tampering',async()=>{
 const objects=new Map(),bucket={async put(key,bytes){objects.set(key,bytes);},async head(key){const b=objects.get(key);return b?{size:b.length}:null;},async get(key,{range}){const b=objects.get(key);return b?{body:b.slice(range.offset,range.offset+range.length)}:null;}};
 const configured={...env,REFERENCE_FILES:bucket},headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',configured)).sessionToken,'Content-Type':'video/mp4'};
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 const send=(h=headers,body=bytes)=>worker.fetch(new Request('https://worker.test/media/reference/upload',{method:'POST',headers:h,body}),configured);
 assert.equal((await send({'Content-Type':'video/mp4'})).status,401);
 assert.equal((await send(headers,new Uint8Array(16))).status,400);
 const response=await send();assert.equal(response.status,200);const result=await response.json();assert.ok(result.expiresAt>Date.now());assert.equal(objects.size,1);
 const full=await worker.fetch(new Request(result.url),configured);assert.equal(full.status,200);assert.deepEqual(new Uint8Array(await full.arrayBuffer()),bytes);
 const part=await worker.fetch(new Request(result.url,{headers:{Range:'bytes=4-7'}}),configured);assert.equal(part.status,206);assert.equal(part.headers.get('Content-Range'),'bytes 4-7/16');assert.equal(await part.text(),'ftyp');
 const head=await worker.fetch(new Request(result.url,{method:'HEAD'}),configured);assert.equal(head.headers.get('Content-Length'),'16');assert.equal(await head.text(),'');
 assert.equal((await worker.fetch(new Request(result.url,{headers:{Range:'bytes=80-90'}}),configured)).status,416);
 const altered=result.url.replace(/file\/[^?]+/,'file/wrong-id');assert.equal((await worker.fetch(new Request(altered),configured)).status,404);
 const missing=await worker.fetch(new Request('https://worker.test/media/reference/upload',{method:'POST',headers,body:bytes}),env);assert.equal(missing.status,503);
 objects.clear();assert.equal((await worker.fetch(new Request(result.url),configured)).status,404);
});

test('free KV uploads expire automatically, require a team user and preserve byte ranges',async()=>{
 const objects=new Map();let options;
 const kv={async put(k,v,o){options=o;objects.set(k,{value:v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength),metadata:o.metadata});},async getWithMetadata(k){return objects.get(k)||{value:null,metadata:null};}};
 const e={FIREBASE_PROJECT_ID:env.FIREBASE_PROJECT_ID,VIDEO_FILES:kv},url='https://upload.test/media/reference/upload',headers={Authorization:'Bearer '+await token(),'Content-Type':'video/mp4',Origin:'https://voloshanenkodanil3457-cyber.github.io'},bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 assert.equal((await kvWorker.fetch(new Request(url,{method:'POST',body:bytes}),e)).status,401);
 assert.equal((await kvWorker.fetch(new Request(url,{method:'POST',headers:{...headers,Origin:'https://untrusted.test'},body:bytes}),e)).status,403);
 const result=await kvWorker.fetch(new Request(url,{method:'POST',headers,body:bytes}),e);assert.equal(result.status,200);const data=await result.json();assert.equal(options.expirationTtl,21600);assert.ok(data.readyAt>Date.now()+60000);
 const partial=await kvWorker.fetch(new Request(data.url,{headers:{Range:'bytes=4-7'}}),e);assert.equal(partial.status,206);assert.equal(await partial.text(),'ftyp');
 const key=[...objects.keys()][0];objects.get(key).metadata.expiresAt=Date.now()-1;assert.equal((await kvWorker.fetch(new Request(data.url),e)).status,404);
 membershipRole=null;assert.equal((await kvWorker.fetch(new Request(url,{method:'POST',headers,body:bytes}),e)).status,403);membershipRole='user';
 const limit=await kvWorker.fetch(new Request(url,{method:'POST',headers:{...headers,'Content-Length':String(21*1024*1024)},body:bytes}),e);assert.equal(limit.status,413);
});

test('BytePlus Worker sends source-preserving edit settings rather than fixed ratio and duration',async()=>{
 const headers={Authorization:'Bearer '+await token(),'X-Magic-Session':(await issueSessionToken('alice',env)).sessionToken};
 const payload={prompt:'Edit video',duration:4,ratio:'9:16',resolution:'480p',reference_videos:['https://cdn.test/ref.mp4'],omni_reference_task_type:'edit'};
 const response=await worker.fetch(new Request('https://worker.test/byteplus/submit',{method:'POST',headers,body:JSON.stringify({payload})}),env);
 assert.equal(response.status,200);assert.equal(lastProviderBody.duration,-1);assert.equal(lastProviderBody.ratio,'adaptive');assert.equal(lastProviderBody.omni_reference_task_type,'edit');
});

test('Higgsfield server gates paid submission by consent and binds status access to its owner',async()=>{
 const prior=globalThis.fetch;let calls=0,remoteStatus='completed',remoteError=null;
 globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://api.higgsfield.ai/')){calls++;if(init.method==='POST')return Response.json({request_id:'hf-123',status:'queued'});return Response.json({status:remoteStatus,error:remoteError,video:{url:'https://cdn.test/result.mp4'}});}return prior(url,init);};
 try{
  const configured={...env,HF_CREDENTIALS:'fake-server-id:fake-server-secret'},headers={Authorization:'Bearer '+await token(),'Content-Type':'application/json'},payload={prompt:'Scene',duration:5,resolution:'720p',aspect_ratio:'9:16',reference_images:['https://cdn.test/face.jpg']};
  const invoke=(path,body,h=headers,e=configured)=>hfWorker.fetch(new Request('https://hf.test/higgsfield/'+path,{method:'POST',headers:h,body:JSON.stringify(body)}),e);
  assert.equal((await invoke('config',{},headers,env)).status,200);assert.equal(calls,0);
  assert.equal((await invoke('submit',{payload})).status,409);assert.equal(calls,0);
  const created=await invoke('submit',{payload,confirmed:true});assert.equal(created.status,200);const receipt=await created.json();assert.equal(calls,1);
  const result=await invoke('status',{taskId:receipt.id,taskToken:receipt.taskToken});assert.equal((await result.json()).video.url,'https://cdn.test/result.mp4');
  remoteStatus='failed';remoteError='The selected parameters are not supported for this request.';const failed=await (await invoke('status',{taskId:receipt.id,taskToken:receipt.taskToken})).json();assert.equal(failed.error,remoteError);assert.equal(failed.requestId,'hf-123');
  remoteStatus='nsfw';remoteError=null;assert.match((await (await invoke('status',{taskId:receipt.id,taskToken:receipt.taskToken})).json()).error,/модерацией/);
  const before=calls;assert.equal((await invoke('status',{taskId:receipt.id,taskToken:receipt.taskToken},{...headers,Authorization:'Bearer '+await token('bob')})).status,403);assert.equal(calls,before);
  assert.equal((await invoke('submit',{payload,confirmed:true},{...headers,Origin:'https://evil.test'})).status,403);assert.equal(calls,before);
 }finally{globalThis.fetch=prior;}
});

test('Higgsfield estimate uses exact model input and never sends a generation request',async()=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://api.higgsfield.ai/')){calls++;assert.equal(String(url),'https://api.higgsfield.ai/estimate/bytedance/seedance-2.0/image-to-video');assert.equal(JSON.parse(init.body).image_url,'https://cdn.test/image.jpg');return Response.json({usd:'0.8123',credits:'13.0'});}return prior(url,init);};
 try{const response=await hfWorker.fetch(new Request('https://hf.test/higgsfield/estimate',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({payload:{model:'bytedance/seedance-2.0',prompt:'Scene',duration:5,resolution:'720p',aspect_ratio:'9:16',reference_images:['https://cdn.test/image.jpg']}})}),{...env,HF_CREDENTIALS:'fake-id:fake-secret'});assert.equal(response.status,200);const quote=await response.json();assert.equal(quote.usd,.8123);assert.equal(quote.source,'api_estimate');assert.equal(calls,1);}finally{globalThis.fetch=prior;}
});
