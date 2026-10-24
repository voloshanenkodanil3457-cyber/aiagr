const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function app(role='superuser',uid='alice',config={}){
  const storage={};
  Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>storage[k]=v},removeItem:{value:k=>delete storage[k]}});
  const context=vm.createContext({MAGIC_APP_CONFIG:config,addEventListener:()=>{},console,structuredClone,crypto:webcrypto,localStorage:storage,sessionStorage:storage,queueMicrotask,Blob,Response,URL,AbortController,setTimeout,clearTimeout,location:{origin:'http://localhost'},document:{documentElement:{dataset:{}},querySelector:()=>null},MagicLocal:{get:async()=>null},window:{}});
  vm.runInContext('window=globalThis',context);
  vm.runInContext(fs.readFileSync('source/domain.js','utf8'),context);
  vm.runInContext(fs.readFileSync('source/providers.js','utf8'),context);
  vm.runInContext(fs.readFileSync('tests/firebase-mock.js','utf8'),context);
  const docs=context.__qa.get('docs',{});docs['users/alice'].role=role;context.__qa.put('docs',docs);
  context.__test={user:{uid},profile:{uid,role,displayName:uid},api:{db:{},fsM:context.__qa.sdk}};
  const source=fs.readFileSync('source/app.js','utf8').replace('  init();','  cache.user=__test.user;cache.profile=__test.profile;api=__test.api;readyResolve();');
  vm.runInContext(source,context);
  return {s:context.Studio,c:context,docs:()=>JSON.parse(JSON.stringify(context.__qa.get('docs',{})))};
}

test('Billing corrections preserve original video, require admin and matching request, retain revision history',async()=>{
 const a=app(),d=a.docs();d['videos/bob-video']={...d['videos/bob-video'],provider:'higgsfield',requestId:'hf-bob',cost:.8224,costSource:'higgsfield_tariff'};a.c.__qa.put('docs',d);
 await a.s.saveBillingCorrection('bob-video',{amount:'.70',reference:'Billing transaction A',requestId:'hf-bob'});
 assert.equal(a.docs()['videos/bob-video'].cost,.8224);
 let rows=await a.s.listVideos();assert.equal(a.c.MagicDomain.totals(rows).confirmedCost,.7);assert.equal(rows[0].billingCorrection.revision,1);
 await assert.rejects(a.s.saveBillingCorrection('bob-video',{amount:1,reference:'Billing A',requestId:'hf-bob'}),/уже изменили/);
 await a.s.saveBillingCorrection('bob-video',{amount:'.699',reference:'Billing exact debit',requestId:'hf-bob',expectedRevision:1});
 const correction=a.docs()['config/videoBilling'].entries['bob-video'];assert.equal(correction.history[0].amount,.7);assert.equal(correction.amount,.699);assert.equal(correction.updatedBy,'alice');
 await assert.rejects(a.s.saveBillingCorrection('bob-video',{amount:1,reference:'Billing A',requestId:'other',expectedRevision:2}),/ID запроса изменились/);
 await assert.rejects(a.s.saveBillingCorrection('bob-video',{amount:'',reference:'Billing A',requestId:'hf-bob'}),/Укажи списание/);
 await assert.rejects(a.s.saveBillingCorrection('bob-video',{amount:-1,reference:'Billing A',requestId:'hf-bob'}),/Укажи списание/);
 const u=app('user','bob');await assert.rejects(u.s.saveBillingCorrection('bob-video',{amount:1}),/суперадмин/);
 rows=await u.s.listVideos();assert.equal(rows[0].billingCorrection,undefined);
});
test('Assets queries all results for superuser and only owned results for user',async()=>{
  const boss=app(),user=app('user');
  assert.equal((await boss.s.listVideos()).length,1);
  assert.equal((await user.s.listVideos()).length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(user.c.__qa.get('metrics',{}).queries[0].constraints)),[{field:'uid',op:'==',value:'alice'}]);
});

test('Simple Mode is one stable private Space per user, cannot be renamed/deleted/duplicated and persists its draft',async()=>{
 const a=app('user','alice');let spaces=await a.s.listSpaces();assert.equal(spaces.filter(x=>x.system==='simple').length,1);assert.equal(spaces[0].id,'simple_alice');
 await Promise.all([a.s.ensureSimpleSpace(),a.s.ensureSimpleSpace()]);spaces=await a.s.listSpaces();assert.equal(spaces.filter(x=>x.id==='simple_alice').length,1);
 for(const action of ['deleteSpace','duplicateSpace','renameSpace'])await assert.rejects(a.s[action]('simple_alice','Other'),/Simple Mode/);
 await a.s.saveSpaceState('simple_alice',{savedAt:1,state:{nodes:[],edges:[],simpleDraft:{prompt:'private idea',ratio:'9:16',resolution:'480p'}},assets:[]});
 assert.equal(a.docs()['spaces/simple_alice'].canvasState.state.simpleDraft.prompt,'private idea');
 const b=app('user','bob');await b.s.ensureSimpleSpace();assert.equal(b.s.simpleSpaceId(),'simple_bob');assert.equal((await b.s.listSpaces()).some(x=>x.id==='simple_alice'),false);
 await assert.rejects(b.s.getSpace('first'),/владельцу/);
});

test('first Simple Mode creation works when private rules deny missing reads and never clears a concurrent draft',async()=>{
 const a=app('user'),sdk=a.c.__test.api.fsM,read=sdk.getDoc;let missingReads=0;
 sdk.getDoc=async ref=>{if(ref.path.startsWith('spaces/')&&!a.docs()[ref.path]){missingReads++;throw Object.assign(Error('Missing or insufficient permissions.'),{code:'permission-denied'});}return read(ref);};
 const write=sdk.setDoc;sdk.setDoc=async(ref,data,options)=>{if(ref.path==='spaces/simple_alice'){const docs=a.docs();docs[ref.path]={ownerUid:'alice',canvasState:{state:{simpleDraft:{prompt:'Concurrent draft'}}}};a.c.__qa.put('docs',docs);}return write(ref,data,options);};
 await a.s.ensureSimpleSpace();assert.equal(missingReads,0);assert.equal(a.docs()['spaces/simple_alice'].canvasState.state.simpleDraft.prompt,'Concurrent draft');
 const restored=await a.s.ensureSimpleSpace();assert.equal(restored.canvasState.state.simpleDraft.prompt,'Concurrent draft');
});

test('Simple Mode explicitly routes text-only BytePlus without changing the global provider',async()=>{
 const {s,c}=app('user');c.localStorage.setItem('magic.credentials.alice.seedanceProvider','openrouter');let calls=0;
 c.fetch=async(url,init)=>{calls++;assert.match(String(url),/contents\/generations\/tasks$/);const body=JSON.parse(init.body);assert.equal(body.content.length,1);assert.equal('simpleMode' in body,false);return Response.json({id:'byte-simple'});};
 const row=await s.createVideoRecord({spaceId:s.simpleSpaceId(),provider:'byteplus',seconds:5,resolution:'480p'}),payload={simpleMode:true,prompt:'Bird flying',duration:5,resolution:'480p',ratio:'9:16',reference_images:[],reference_videos:[]};
 await assert.rejects(s.submitGeneration(row.id,{...payload,reference_images:['https://cdn.test/a.jpg']},'byteplus'),/только по тексту/);assert.equal(calls,0);
 const submitted=await s.submitGeneration(row.id,payload,'byteplus');assert.equal(submitted.requestId,'byte-simple');assert.equal(calls,1);assert.equal(s.activeVideoProvider(),'openrouter');
 const other=await s.createVideoRecord({spaceId:'ordinary',provider:'byteplus'});await assert.rejects(s.submitGeneration(other.id,payload,'byteplus'),/Активный провайдер/);assert.equal(calls,1);
});
test('superuser removes another user result, keeps lifetime score and only a minimal replay marker',async()=>{
  const a=app();const score=a.docs()['leaderboard/bob'];await a.s.permanentlyDeleteVideo('bob-video');
  assert.equal(a.docs()['videos/bob-video'],undefined);
  assert.deepEqual(a.docs()['videoDeletions/bob-video'],{uid:'bob'});
  assert.deepEqual(a.docs()['leaderboard/bob'],score);
  assert.equal((await a.s.listVideos()).length,0);
});
test('regular user cannot permanently delete even their own result; running results cannot be removed',async()=>{
  const user=app('user','bob');await assert.rejects(user.s.permanentlyDeleteVideo('bob-video'),/суперадмину/);
  const boss=app(),d=boss.docs();d['videos/bob-video'].status='running';boss.c.__qa.put('docs',d);
  await assert.rejects(boss.s.permanentlyDeleteVideo('bob-video'),/завершения/);
  assert.ok(boss.docs()['videos/bob-video']);assert.equal(boss.docs()['videoDeletions/bob-video'],undefined);
});
test('failed result is physically removed and stale local sync cannot recreate it or award XP',async()=>{
  const a=app(),row=await a.s.createVideoRecord({seconds:8});
  await a.s.updateVideo(row.id,{status:'failed',error:'Failed fixture'});
  await a.s.permanentlyDeleteVideo(row.id);assert.equal(a.docs()['videos/'+row.id],undefined);
  const writes=a.c.__qa.get('metrics',{}).writes;
  a.c.localStorage.setItem('magic.job.v3.alice.'+row.id,JSON.stringify({...row,status:'completed',cloudSaved:false}));
  // Same recovery path used when a stale browser tab restarts.
  await a.s.updateVideo(row.id,{status:'completed'});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(a.docs()['videos/'+row.id],undefined);
  assert.equal(a.c.localStorage.getItem('magic.job.v3.alice.'+row.id),null);
  assert.equal(a.c.__qa.get('metrics',{}).writes,writes);
});

function canvasFixture(a,{local=false,id='recovered',deleted=false,foreign=false}={}){
  const docs=a.docs();
  const payload={version:6,savedAt:100,state:{nodes:[
    {id:'G1',type:'generation',fields:{text:'Walking in Lisbon',duration:'4',resolution:'480p',ratio:'9:16'},assets:[]},
    {id:'O1',type:'output',fields:{generationId:id,status:'completed',requestId:'task-1',videoUrl:'https://cdn.test/expired.mp4',providerUrlExpiresAt:1},...(foreign?{videoRecord:{id,uid:'bob',status:'completed'}}:{})}
  ],edges:[{from:'G1',to:'O1'}]}};
  docs['spaces/first'].canvasState=local?null:payload;
  if(deleted)docs['videoDeletions/'+id]={uid:'alice'};
  a.c.__qa.put('docs',docs);
  if(local)a.c.localStorage.setItem('magic.canvas.cache.v1.alice.first',JSON.stringify(payload));
}
test('normal user recovers an expired Canvas result into Firestore and the admin can list it',async()=>{
  const a=app('user');canvasFixture(a);
  const rows=await a.s.listVideos();assert.equal(rows.length,1);assert.equal(rows[0].cloudSaved,true);
  assert.equal(a.docs()['videos/recovered'].uid,'alice');assert.equal(a.docs()['videos/recovered'].prompt,'Walking in Lisbon');
  assert.equal(a.docs()['leaderboard/alice'].completed,1);
  const writes=a.c.__qa.get('metrics',{}).writes;await a.s.listVideos();assert.equal(a.c.__qa.get('metrics',{}).writes,writes);
  const boss=app();boss.c.__qa.put('docs',a.docs());assert.equal((await boss.s.listVideos()).length,2);
});
test('local Canvas recovery never reads another account cache or recreates an admin-deleted result',async()=>{
  const a=app('user');canvasFixture(a,{local:true,deleted:true});
  assert.equal((await a.s.listVideos()).length,0);assert.equal(a.docs()['videos/recovered'],undefined);
  assert.equal(a.docs()['leaderboard/alice'],undefined);
  const b=app('user');canvasFixture(b,{foreign:true});assert.equal((await b.s.listVideos()).length,0);
});
test('Assets retries the durable outbox and explicitly retains errors when Firebase denies saving',async()=>{
  const a=app('user');canvasFixture(a,{local:true});
  const sdk=a.c.__test.api.fsM,run=sdk.runTransaction;
  sdk.runTransaction=async()=>{const error=new Error('Missing or insufficient permissions');error.code='permission-denied';throw error;};
  let rows=await a.s.listVideos();assert.equal(rows.length,1);assert.equal(rows[0].cloudSaved,false);assert.match(rows[0].syncError,/Firestore rules/);
  sdk.runTransaction=run;rows=await a.s.listVideos();assert.equal(rows[0].cloudSaved,true);assert.equal(rows[0].syncError,null);
  assert.equal(a.docs()['videos/recovered'].syncError,undefined);
});
test('only superuser can save validated pricing and stale changes are rejected',async()=>{
  const user=app('user');await assert.rejects(user.s.saveVideoPricing({'480p':1,'720p':2,'1080p':3},user.c.MagicDomain.defaultVideoPrices),/суперадмин/);
  const boss=app(),initial=await boss.s.loadVideoPricing(),rates={'480p':.2,'720p':.3,'1080p':.6};
  await boss.s.saveVideoPricing(rates,initial);assert.deepEqual(boss.docs()['config/videoPricing'].rates,rates);
  await assert.rejects(boss.s.saveVideoPricing({'480p':1,'720p':2,'1080p':3},initial),/уже изменились/);
  const row=await boss.s.createVideoRecord({seconds:4,resolution:'480p'});
  await boss.s.saveVideoPricing({'480p':1,'720p':2,'1080p':3},rates);
  await boss.s.updateVideo(row.id,{status:'completed'});const result=(await boss.s.listVideos()).find(v=>v.id===row.id);
  assert.equal(result.cost,.8);assert.equal(result.costSource,'tariff');
});

function downloads(a){
  const elements=[],requests=[],releases=[];
  a.c.document.createElement=tag=>{const e={tag,style:{},setAttribute(){},addEventListener(){},append(...items){this.children=(this.children||[]).concat(items);},click(){this.clicked=true;},remove(){this.removed=true;},showModal(){this.open=true;},close(){this.onclose?.();}};elements.push(e);return e;};
  a.c.document.body={append(){}};
  a.c.location.href='https://magic.test/assets.html';a.c.location.origin='https://magic.test';
  a.c.setTimeout=(fn,ms)=>{releases.push({fn,ms});return 1;};a.c.clearTimeout=()=>{};
  a.c.fetch=async(url,options)=>{requests.push({url,options});return new Response(new Blob(['video'],{type:'video/mp4'}));};
  a.c.Response=Response;
  return {elements,requests,releases};
}
test('BytePlus opens the save link immediately without fetching, a preview or a dialog',async()=>{
  const a=app(),d=downloads(a);
  const promise=a.s.downloadVideo({id:'result',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/video.mp4'});
  const link=d.elements.find(e=>e.tag==='a');
  assert.equal(link.clicked,true);assert.equal(link.href,'https://cdn.test/video.mp4');
  assert.equal(link.download,'magic-result.mp4');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
  assert.equal(d.requests.length,0);assert.equal(d.elements.some(e=>e.tag==='dialog'),false);
  assert.equal((await promise).method,'native');
});
test('regular users cannot open foreign videos and unsafe or missing links are rejected',async()=>{
  const a=app('user'),d=downloads(a);
  await assert.rejects(a.s.downloadVideo({id:'other',uid:'bob',videoUrl:'https://cdn.test/other.mp4'}),/Нет доступа/);
  await assert.rejects(a.s.downloadVideo({id:'bad',uid:'alice',videoUrl:'javascript:alert(1)'}),/Недопустимая/);
  await assert.rejects(a.s.downloadVideo({id:'pending',uid:'alice'}),/ещё не готово/);
  assert.equal(d.elements.length,0);assert.equal(d.requests.length,0);
});
test('superuser follows another user provider link without sending credentials to a gateway',async()=>{
  const a=app(),d=downloads(a);a.c.localStorage.setItem('magic.credentials.alice.gateway','https://worker.test');
  await a.s.downloadVideo({id:'team',uid:'bob',remoteUrl:'https://cdn.test/video.mp4',gatewayUrl:'https://untrusted.test',requestId:'task',taskToken:'TASK'});
  assert.equal(d.requests.length,0);assert.equal(d.elements.find(e=>e.tag==='a').href,'https://cdn.test/video.mp4');
});

test('local video is uploaded as binary and its temporary URL is reused without changing graph metadata',async()=>{
 const {s,c}=app('user');const file=new Blob(['video bytes'],{type:'video/mp4'}),item={id:'local-video',kind:'video',url:'blob:local'};
 c.MagicLocal.get=async()=>({file});c.localStorage.setItem('magic.credentials.alice.gateway','https://worker.test');
 c.__test.api.auth={currentUser:{getIdToken:async()=>'firebase-test'}};
 c.document.querySelector=()=>({dataset:{}});let uploads=0;
 c.fetch=async(url,options)=>{if(url.endsWith('/media/reference/upload')){uploads++;assert.equal(options.body,file);assert.equal(options.headers['Content-Type'],'video/mp4');assert.equal(options.headers['X-Magic-Session'],'session-test');return Response.json({url:'https://worker.test/media/reference/file/one?token=signed',expiresAt:Date.now()+86400000});}throw Error('Unexpected request');};
 c.localStorage.setItem('magic.credentials.alice.session.https://worker.test',JSON.stringify({gateway:'https://worker.test',token:'session-test',expiresAt:Date.now()+86400000}));
 const first=await s.ensureRemoteAsset(item,{provider:'byteplus'}),second=await s.ensureRemoteAsset(item,{provider:'byteplus'});
 assert.equal(first.referenceUrl,second.referenceUrl);assert.equal(uploads,1);assert.equal(item.url,'blob:local');assert.equal(item.referenceUrl,undefined);
 c.MagicLocal.get=async()=>({file:new Blob(['webm'],{type:'video/webm'})});
 await assert.rejects(s.ensureRemoteAsset({...item,id:'unsupported'},{provider:'byteplus'}),/MP4/);
});

test('dedicated free uploader works with Direct API and does not receive a provider API key',async()=>{
 const {s,c}=app('user','alice',{referenceUploadUrl:'https://upload.test'}),file=new Blob(['video'],{type:'video/mp4'});
 c.MagicLocal.get=async()=>({file});c.__test.api.auth={currentUser:{getIdToken:async()=>'firebase-only'}};c.document.querySelector=()=>({dataset:{}});
 c.fetch=async(url,o)=>{assert.equal(url,'https://upload.test/media/reference/upload');assert.equal(o.headers.Authorization,'Bearer firebase-only');assert.equal(o.headers['X-OpenRouter-Key'],undefined);assert.equal(o.body,file);return Response.json({url:'https://upload.test/media/reference/file/one/two',expiresAt:Date.now()+21600000});};
 const value=await s.ensureRemoteAsset({id:'v',kind:'video'},{provider:'byteplus'});assert.ok(value.referenceUrl.startsWith('https://upload.test/'));
 c.MagicLocal.get=async()=>({file:{type:'video/mp4',size:21*1024*1024}});await assert.rejects(s.ensureRemoteAsset({id:'big',kind:'video'},{provider:'byteplus'}),/20 МБ/);
});

test('Direct BytePlus submission keeps edit duration -1 instead of clamping it to four seconds',async()=>{
 const {s,c}=app('user');c.localStorage.setItem('magic.credentials.alice.apiKey','test-provider-key');
 c.localStorage.setItem('magic.job.v3.alice.edit-one',JSON.stringify({id:'edit-one',uid:'alice',status:'queued'}));let sent;
 c.fetch=async(url,o)=>{sent=JSON.parse(o.body);return Response.json({id:'task-edit'});};
 await s.submitGeneration('edit-one',{prompt:'Edit @Video1',duration:4,aspect_ratio:'9:16',resolution:'480p',reference_videos:['https://cdn.test/ref.mp4'],omni_reference_task_type:'edit'},'byteplus');
 assert.equal(sent.duration,-1);assert.equal(sent.ratio,'adaptive');assert.equal(sent.omni_reference_task_type,'edit');assert.equal(sent.content[1].type,'video_url');
});

test('Higgsfield never submits without cost consent and keeps the active BytePlus provider',async()=>{
 const {s,c}=app('user');c.localStorage.setItem('magic.credentials.alice.apiKey','byteplus-test');s.setHiggsfieldGateway('https://hf.test');
 c.__test.api.auth={currentUser:{getIdToken:async()=>'firebase-only'}};c.localStorage.setItem('magic.job.v3.alice.hf-test',JSON.stringify({id:'hf-test',uid:'alice',provider:'higgsfield',status:'queued'}));
 let calls=0;c.fetch=async(url,o)=>{calls++;if(url==='https://hf.test/higgsfield/estimate')return Response.json({usd:'1.2345',credits:'10'});assert.equal(url,'https://hf.test/higgsfield/submit');assert.equal(o.headers.Authorization,'Bearer firebase-only');assert.equal(JSON.parse(o.body).confirmed,true);return Response.json({id:'hf-request',taskToken:'receipt'});};
 await assert.rejects(s.submitGeneration('hf-test',{prompt:'Scene'},'higgsfield'),/Подтверди/);assert.equal(calls,0);
 await s.submitGeneration('hf-test',{prompt:'Scene',higgsfieldConfirmed:true},'higgsfield');assert.equal(calls,2);assert.equal((await s.getVideo('hf-test')).estimatedCost,1.2345);assert.equal(s.activeVideoProvider(),'byteplus');
 c.fetch=async()=>Response.json({status:'completed',video:{url:'https://cdn.test/hf.mp4'}});const completed=await s.refreshGeneration('hf-test');assert.equal(completed.cost,1.2345);assert.equal(completed.costSource,'api_estimate');
 assert.equal(c.MagicDomain.estimateCost({provider:'higgsfield',seconds:5,resolution:'720p'}),null);
});

test('Higgsfield missing or unavailable estimate does not block an explicitly confirmed generation',async()=>{
 for(const estimate of [()=>Response.json({error:'No price'},{status:502}),()=>Response.json({credits:'10'}),()=>{throw new TypeError('Failed to fetch');}]){
  const {s,c}=app('user');s.setHiggsfieldGateway('https://hf.test');c.__test.api.auth={currentUser:{getIdToken:async()=>'firebase-only'}};
  c.localStorage.setItem('magic.job.v3.alice.hf-no-price',JSON.stringify({id:'hf-no-price',uid:'alice',provider:'higgsfield',status:'queued'}));
  let submits=0;c.fetch=async url=>{if(url.endsWith('/estimate'))return estimate();submits++;return Response.json({id:'hf-request',taskToken:'receipt'});};
  await assert.rejects(s.submitGeneration('hf-no-price',{prompt:'Scene'},'higgsfield'),/Подтверди/);assert.equal(submits,0);
  await s.submitGeneration('hf-no-price',{prompt:'Scene',higgsfieldConfirmed:true},'higgsfield');assert.equal(submits,1);
  const row=await s.getVideo('hf-no-price');assert.equal(row.estimatedCost,null);assert.equal(row.pricingStatus,'unavailable');assert.equal(row.requestId,'hf-request');
 }
});

test('a completed Higgsfield task without an API quote freezes a public tariff estimate',async()=>{
 const {s,c}=app('user');s.setHiggsfieldGateway('https://hf.test');c.__test.api.auth={currentUser:{getIdToken:async()=>'firebase-only'}};
 const record=await s.createVideoRecord({provider:'higgsfield',model:'bytedance/seedance-2.5',seconds:5,resolution:'720p',ratio:'16:9'});
 await s.updateVideo(record.id,{requestId:'hf-result',taskToken:'receipt',gatewayUrl:'https://hf.test'});c.fetch=async()=>Response.json({status:'completed',video:{url:'https://cdn.test/result.mp4'}});
 const done=await s.refreshGeneration(record.id);assert.equal(done.cost,2.3112);assert.equal(done.costSource,'higgsfield_tariff');assert.equal(done.pricingVersion,'hf-public-tokens-2026-10-24');assert.equal(c.MagicDomain.totals([done]).estimatedCostCount,1);
});

test('Higgsfield completed quote contributes to cost totals as an estimate, failed quotes do not',async()=>{
 const {s,c}=app('user');const D=c.MagicDomain;
 const rows=[{provider:'byteplus',status:'completed',cost:1,costSource:'api'},{provider:'higgsfield',status:'completed',cost:2.3456,costSource:'api_estimate'},{provider:'higgsfield',status:'failed',estimatedCost:9},{provider:'higgsfield',status:'completed',cost:null}];
 const total=D.totals(rows);assert.equal(total.cost,3.3456);assert.equal(total.estimatedCostCount,1);assert.equal(total.unknownCost,1);
});
