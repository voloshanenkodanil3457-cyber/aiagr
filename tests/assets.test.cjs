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
test('BytePlus downloads before any preview, attaches the download link and delays cleanup',async()=>{
  const a=app(),d=downloads(a);
  const result=await a.s.downloadVideo({id:'result',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/video.mp4'});
  assert.equal(result.method,'download');assert.equal(d.requests[0].url,'https://cdn.test/video.mp4');
  const link=d.elements.find(e=>e.tag==='a');assert.equal(link.clicked,true);assert.equal(link.download,'magic-result.mp4');assert.ok(link.href.startsWith('blob:'));
  assert.ok(d.releases.some(r=>r.ms===60000));
});
test('CORS-blocked videos offer a native save link without treating playback as a failed generation',async()=>{
  const a=app(),d=downloads(a);a.c.fetch=async()=>{throw vm.runInContext('new TypeError("Failed to fetch")',a.c);};
  const result=await a.s.downloadVideo({id:'result',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/video.mp4'});
  assert.equal(result.method,'native');const link=d.elements.find(e=>e.tag==='a');assert.equal(link.href,'https://cdn.test/video.mp4');assert.equal(link.rel,'noopener noreferrer');
  assert.ok(d.elements.some(e=>e.tag==='dialog'&&e.open));
});
test('HTTP expiry stays an error and foreign user results never start a download request',async()=>{
  const a=app('user'),d=downloads(a);a.c.fetch=async()=>new Response('',{status:410});
  await assert.rejects(a.s.downloadVideo({id:'gone',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/gone.mp4'}),/истекла/);
  await assert.rejects(a.s.downloadVideo({id:'other',uid:'bob',videoUrl:'https://cdn.test/other.mp4'}),/Нет доступа/);
  assert.equal(d.elements.filter(e=>e.tag==='a').length,0);
});

test('BytePlus Worker download streams the task with auth instead of fetching its CORS-blocked CDN',async()=>{
  const a=app(),d=downloads(a),gateway='https://worker.test';
  a.c.__test.api.auth={currentUser:{getIdToken:async()=> 'TEST-ID-TOKEN'}};
  a.c.localStorage.setItem('magic.credentials.alice.gateway',gateway);
  a.c.localStorage.setItem('magic.credentials.alice.session.'+gateway,JSON.stringify({gateway,token:'SESSION',expiresAt:Date.now()+3600000}));
  const result=await a.s.downloadVideo({id:'worker-result',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/video.mp4',gatewayUrl:gateway,requestId:'task-1',taskToken:'TASK-RECEIPT'});
  assert.equal(result.method,'download');assert.equal(d.requests[0].url,gateway+'/byteplus/media/task-1');
  assert.equal(d.requests[0].options.headers.Authorization,'Bearer TEST-ID-TOKEN');assert.equal(d.requests[0].options.headers['X-Task-Token'],'TASK-RECEIPT');assert.equal(d.requests[0].options.headers['X-Magic-Session'],'SESSION');
});
test('a tampered Worker URL never receives Firebase credentials',async()=>{
  const a=app(),d=downloads(a);a.c.localStorage.setItem('magic.credentials.alice.gateway','https://worker.test');
  await a.s.downloadVideo({id:'tampered',uid:'alice',provider:'byteplus',videoUrl:'https://cdn.test/video.mp4',gatewayUrl:'https://untrusted.test',requestId:'task-1',taskToken:'TASK'});
  assert.equal(d.requests[0].url,'https://cdn.test/video.mp4');assert.equal(d.requests[0].options.headers,undefined);
});
