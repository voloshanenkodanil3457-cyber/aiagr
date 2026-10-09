const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function app(role='superuser',uid='alice'){
  const storage={};
  Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>storage[k]=v},removeItem:{value:k=>delete storage[k]}});
  const context=vm.createContext({addEventListener:()=>{},console,structuredClone,crypto:webcrypto,localStorage:storage,sessionStorage:storage,queueMicrotask,Blob,URL,AbortController,setTimeout,clearTimeout,location:{origin:'http://localhost'},document:{documentElement:{dataset:{}},querySelector:()=>null},MagicLocal:{get:async()=>null},window:{}});
  vm.runInContext('window=globalThis',context);
  vm.runInContext(fs.readFileSync('source/domain.js','utf8'),context);
  vm.runInContext(fs.readFileSync('tests/firebase-mock.js','utf8'),context);
  const docs=context.__qa.get('docs',{});docs['users/alice'].role=role;context.__qa.put('docs',docs);
  context.__test={user:{uid},profile:{uid,role,displayName:uid},api:{db:{},fsM:context.__qa.sdk}};
  const source=fs.readFileSync('source/app.js','utf8').replace('  init();','  cache.user=__test.user;cache.profile=__test.profile;api=__test.api;readyResolve();');
  vm.runInContext(source,context);
  return {s:context.Studio,c:context,docs:()=>JSON.parse(JSON.stringify(context.__qa.get('docs',{})))};
}
test('Assets queries all results for superuser and only owned results for user',async()=>{
  const boss=app(),user=app('user');
  assert.equal((await boss.s.listVideos()).length,1);
  assert.equal((await user.s.listVideos()).length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(user.c.__qa.get('metrics',{}).queries[0].constraints)),[{field:'uid',op:'==',value:'alice'}]);
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
