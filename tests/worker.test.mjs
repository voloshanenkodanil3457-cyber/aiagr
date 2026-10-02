import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/worker.js';
import {authenticate,issueTaskToken,verifyTaskToken,issueSessionToken} from '../cloudflare-worker/auth.js';
const env={FIREBASE_PROJECT_ID:'demo-magic-tests',ARK_API_KEY:'test-only-provider-secret'},originalFetch=globalThis.fetch;
let lastProviderBody,keys,jwk,providerCalls=0,membershipRole='user',profileReads=0;
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
  if(String(url).includes('bytepluses.com')){providerCalls++;if(init?.body)lastProviderBody=JSON.parse(init.body);return Response.json(init?.method==='POST'?{id:'task-1'}:{status:'running'});}
  throw new Error('Unexpected network: '+url);
 };
});
after(()=>{globalThis.fetch=originalFetch;});
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
