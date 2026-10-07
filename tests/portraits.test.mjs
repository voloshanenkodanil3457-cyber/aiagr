import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {signedArkRequest} from '../cloudflare-worker/ark-assets.js';
import {issueResourceToken,verifyResourceToken} from '../cloudflare-worker/auth.js';
import {portraitRoute,servePortraitFile,validatePortraitReferences} from '../cloudflare-worker/portraits.js';
const env={ARK_API_KEY:'fake-ark-key',TASK_TOKEN_SECRET:'fake-receipt-secret',BYTEPLUS_ACCESS_KEY_ID:'fake-ak',BYTEPLUS_SECRET_ACCESS_KEY:'fake-sk',PORTRAIT_CALLBACK_URL:'https://magic.test/portrait-callback.html'};
const originalFetch=globalThis.fetch;let calls=[];
const mock=handler=>{calls=[];globalThis.fetch=async(url,init)=>{const action=new URL(url).searchParams.get('Action'),body=JSON.parse(init.body);calls.push({url,action,body,headers:init.headers});return handler(action,body);};};
const json=result=>Response.json({Result:result});
const request=(route,body)=>new Request('https://worker.test/byteplus/portraits/'+route,{method:'POST',body:JSON.stringify(body||{})});
after(()=>globalThis.fetch=originalFetch);

test('OpenAPI signature matches an independently computed fixed-date canonical request',async()=>{
 const {url,init}=await signedArkRequest('CreateAsset',{GroupId:'group-one',URL:'https://photo.test/a.jpg'},env,new Date('2026-10-07T11:22:33Z'));
 const hash=x=>createHash('sha256').update(x).digest('hex'),hmac=(key,x)=>createHmac('sha256',key).update(x).digest();
 const payloadHash=hash(init.body),canonical=['POST','/','Action=CreateAsset&Version=2024-01-01',`content-type:application/json\nhost:ark.ap-southeast-1.byteplusapi.com\nx-content-sha256:${payloadHash}\nx-date:20261007T112233Z\n`,'content-type;host;x-content-sha256;x-date',payloadHash].join('\n');
 const key=hmac(hmac(hmac(hmac('fake-sk','20261007'),'ap-southeast-1'),'ark'),'request');
 const expected=hmac(key,['HMAC-SHA256','20261007T112233Z','20261007/ap-southeast-1/ark/request',hash(canonical)].join('\n')).toString('hex');
 assert.ok(init.headers.Authorization.endsWith('Signature='+expected));assert.equal(init.headers['X-Date'],'20261007T112233Z');assert.ok(url.includes('Action=CreateAsset'));assert.ok(!init.body.includes('fake-sk'));
});
test('resource receipts cannot switch owner, purpose, project, or asset ID',async()=>{
 const token=await issueResourceToken('alice','portrait-group',{id:'group-one'},env);
 assert.equal((await verifyResourceToken(token,'alice','portrait-group',env)).id,'group-one');
 await assert.rejects(verifyResourceToken(token,'bob','portrait-group',env));await assert.rejects(verifyResourceToken(token,'alice','portrait-asset',env));
 await assert.rejects(verifyResourceToken(token+'x','alice','portrait-group',env));
 const expired=await issueResourceToken('alice','portrait-group',{id:'group-one'},env,-1);await assert.rejects(verifyResourceToken(expired,'alice','portrait-group',env));
});
test('real-person verification finishes only through provider result, never client resultCode',async()=>{
 mock((action,body)=>action==='CreateVisualValidateSession'?json({BytedToken:'provider-session',H5Link:'https://www.byteplus.com/verification'}):json({GroupId:'group-person'}));
 const session=await portraitRoute(request('verify/start',{}),env,'alice');assert.ok(session.h5Link.includes('lng=en'));assert.ok(!JSON.stringify(session).includes('fake-sk'));
 const result=await portraitRoute(request('verify/finish',{sessionToken:session.sessionToken,resultCode:10000,groupId:'attacker-group'}),env,'alice');assert.equal(result.id,'group-person');assert.equal(calls[1].body.BytedToken,'provider-session');
 const before=calls.length;await assert.rejects(portraitRoute(request('verify/finish',{sessionToken:session.sessionToken}),env,'bob'));assert.equal(calls.length,before);
 mock(()=>json({}));await assert.rejects(portraitRoute(request('verify/finish',{sessionToken:session.sessionToken,resultCode:10000}),env,'alice'),e=>e.status===409);
});
test('only authorized group accepts CreateAsset; moderation is not disabled',async()=>{
 mock(action=>action==='CreateAssetGroup'?json({Id:'group-ai'}):json({Id:'asset-photo'}));
 const group=await portraitRoute(request('groups/create',{name:'Fictional hero',type:'AIGC'}),env,'alice');
 const photo=await portraitRoute(request('assets/create',{groupToken:group.token,url:'https://photo.test/a.jpg',name:'photo'}),env,'alice');assert.equal(photo.id,'asset-photo');
 assert.equal(calls[1].body.GroupId,'group-ai');assert.equal(calls[1].body.AssetType,'Image');assert.equal(calls[1].body.ProjectName,'default');assert.equal(calls[1].body.Moderation,undefined);
 const before=calls.length;await assert.rejects(portraitRoute(request('assets/create',{groupToken:group.token,url:'https://photo.test/a.jpg'}),env,'bob'));assert.equal(calls.length,before);
 await assert.rejects(portraitRoute(request('assets/create',{groupToken:group.token,url:'data:image/png;base64,aGVsbG8='}),env,'alice'));
 await assert.rejects(portraitRoute(request('assets/create',{groupToken:group.token,url:'https://photo.test/a.jpg'}),{...env,BYTEPLUS_PROJECT_NAME:'other'},'alice'));
 await assert.rejects(portraitRoute(request('groups/create',{name:'Human',type:'LivenessFace'}),env,'alice'));
});
test('Processing/Failed portraits cannot reach inference; Active references retain exact asset URI',async()=>{
 mock(action=>action==='CreateAssetGroup'?json({Id:'group-ai'}):json({Id:'asset-photo'}));
 const group=await portraitRoute(request('groups/create',{name:'AI',type:'AIGC'}),env,'alice'),asset=await portraitRoute(request('assets/create',{groupToken:group.token,url:'https://photo.test/a.jpg'}),env,'alice');
 const payload={reference_images:['asset://asset-photo'],asset_receipts:{'asset-photo':asset.token}};
 for(const Status of ['Processing','Failed']){mock(()=>json({Status,GroupId:'group-ai',AssetType:'Image'}));await assert.rejects(validatePortraitReferences(payload,'alice',env),e=>e.status===409);}
 mock(()=>json({Status:'Active',GroupId:'group-ai',AssetType:'Image'}));await validatePortraitReferences(payload,'alice',env);assert.equal(payload.reference_images[0],'asset://asset-photo');
 await assert.rejects(validatePortraitReferences(payload,'bob',env));await assert.rejects(validatePortraitReferences({...payload,asset_receipts:{}},'alice',env));
 mock(()=>json({Status:'Active',GroupId:'group-other',AssetType:'Image'}));await assert.rejects(validatePortraitReferences(payload,'alice',env));
});
test('private staging is bounded, signed, and deleted after provider processing',async()=>{
 const objects=new Map(),r2={put:async(k,b)=>objects.set(k,b),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)},local={...env,PORTRAIT_FILES:r2};
 const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2]);
 const uploaded=await portraitRoute(new Request('https://worker.test/byteplus/portraits/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:png}),local,'alice');
 assert.equal(objects.size,1);assert.equal((await servePortraitFile(new Request(uploaded.url),local)).status,200);
 await assert.rejects(servePortraitFile(new Request(uploaded.url.replace(uploaded.hash,'wrong')),local));
 const other=new URL(uploaded.url);other.searchParams.set('token','bad');await assert.rejects(servePortraitFile(new Request(other),local));
 await assert.rejects(portraitRoute(new Request('https://worker.test/byteplus/portraits/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:'<svg/>'}),local,'alice'));
 mock(action=>action==='CreateAssetGroup'?json({Id:'group-ai'}):action==='CreateAsset'?json({Id:'asset-photo'}):json({Status:'Active',GroupId:'group-ai',AssetType:'Image'}));
 const group=await portraitRoute(request('groups/create',{name:'AI',type:'AIGC'}),local,'alice'),asset=await portraitRoute(request('assets/create',{groupToken:group.token,url:uploaded.url,fileToken:uploaded.fileToken}),local,'alice');
 await portraitRoute(request('assets/status',{assetToken:asset.token}),local,'alice');assert.equal(objects.size,0);
});
test('missing setup fails clearly and imported groups require superuser',async()=>{
 assert.equal((await portraitRoute(request('config'),{},'alice')).ready,false);
 await assert.rejects(portraitRoute(request('verify/start'),{ARK_API_KEY:'key'},'alice'),e=>e.status===503);
 await assert.rejects(portraitRoute(request('verify/start'),{...env,PORTRAIT_CALLBACK_URL:null},'alice'),e=>e.status===503);
 globalThis.fetch=async()=>Response.json({fields:{role:{stringValue:'user'}}});await assert.rejects(portraitRoute(request('groups/connect',{id:'group-shared'}),env,'alice'),e=>e.status===403);
});
