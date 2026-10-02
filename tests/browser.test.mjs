import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const playwright=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+pathname);if(!target.startsWith(root+path.sep))throw new Error('path');const data=await fs.readFile(target);res.setHeader('content-type',target.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
const context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await context.addInitScript({path:path.join(root,'tests/firebase-mock.js')});
const functions=['initializeApp','deleteApp','getAuth','setPersistence','onAuthStateChanged','signInWithEmailAndPassword','createUserWithEmailAndPassword','signOut','deleteUser','getFirestore','getStorage','doc','collection','query','where','getDoc','getDocs','setDoc','updateDoc','deleteDoc','writeBatch','runTransaction','ref','uploadBytes','getDownloadURL','deleteObject'];
const module=functions.map(f=>`export const ${f}=(...args)=>window.__qa.sdk.${f}(...args);`).join('\n')+'\nexport const browserLocalPersistence="local",inMemoryPersistence="memory";';
await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(url.endsWith('/firebase-storage.js'))throw new Error('Spark must not load Firebase Storage');
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:module});
  if(url.includes('ark.ap-southeast.bytepluses.com')){
    if(req.method()==='POST'){
      const id=await page.evaluate(body=>{const rows=__qa.get('submissions',[]),id='task-'+(rows.length+1);rows.push({id,body});__qa.put('submissions',rows);return id;},req.postDataJSON());
      return route.fulfill({contentType:'application/json',body:JSON.stringify({id})});
    }
    const mode=await page.evaluate(()=>__qa.get('taskStatus','running'));if(mode==='network')return route.abort();
    return route.fulfill({contentType:'application/json',body:JSON.stringify(mode==='completed'?{status:'succeeded',content:{video_url:base+'qa-result.mp4'},duration:10,cost:0.25}:mode==='failed'?{status:'failed',error:{message:'Provider rejected the generation'}}:{status:'running',progress:20})});
  }
  if(url.includes('/qa-media/')&&url.endsWith('.png'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  if(url.includes('/qa-media/')||url.endsWith('/qa-result.mp4'))return route.fulfill({contentType:'video/mp4',body:Buffer.alloc(16)});
  if(url.startsWith(base))return route.continue();
  return route.abort();
});
const metrics=()=>page.evaluate(()=>__qa.get('metrics',{}));
const reset=()=>page.evaluate(()=>__qa.reset());
const waitReady=()=>page.waitForFunction(()=>window.Studio?.current());
try{
  await page.goto(base+'spaces.html');await waitReady();await page.locator('.space-row').first().waitFor();assert.equal(await page.locator('.space-row').count(),1);assert.ok(!(await page.locator('#spaces-list').textContent()).includes('BOB PRIVATE'));
  await page.goto(base+'nodes.html?space=first');await page.locator('#empty-state button').waitFor();await reset();
  await page.click('#add-toggle');await page.click('[data-add="generation"]');await page.locator('[data-node=G1] textarea').fill('A cinematic test');
  await page.locator('#generation-composer').waitFor({state:'visible'});
  await page.locator('.composer-settings summary').click();await page.click('[data-setting="resolution"][data-value="1080p"]');
  await page.locator('[data-panel-field="generateAudio"]').selectOption('false');
  await page.locator('[data-panel-field="duration"]').fill('10');await page.locator('[data-panel-field="duration"]').dispatchEvent('change');await page.click('#settings-close');
  const box=await page.locator('[data-node=G1] .port.out').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+320,box.y+80,{steps:12});await page.mouse.up();
  await page.locator('#port-menu').waitFor({state:'visible'});assert.ok((await page.locator('#port-menu').textContent()).includes('Output'));
  await page.getByRole('button',{name:'▷ Output',exact:true}).click();assert.equal(await page.locator('[data-type=output]').count(),1);
  const inbox=await page.locator('[data-node=G1] .port.in').boundingBox();await page.mouse.move(inbox.x+8,inbox.y+8);await page.mouse.down();await page.mouse.move(inbox.x-220,inbox.y-20,{steps:10});await page.mouse.up();
  const options=await page.locator('#port-menu').textContent();assert.ok(options.includes('Media')&&options.includes('Preset'));assert.ok(!options.includes('Text generation'));
  await page.getByRole('button',{name:'▱ Preset',exact:true}).click();await page.locator('[data-node=P1] .preset-excerpt').click();
  const longPrompt='Complete preset text. '.repeat(40);await page.locator('[data-panel-field=text]').fill(longPrompt);await page.locator('[data-panel-field=heading]').fill('Cinematic preset');await page.click('#close-panel');
  assert.equal((await metrics()).writes,0,'editing should never write to Firestore');assert.equal((await metrics()).reads,0,'editing should never read Firestore');
  await page.locator('[data-node=G1] textarea').click();await page.locator('[data-panel-field=batch]').selectOption('2');
  await page.screenshot({path:'/tmp/magic-canvas-composer.png'});await page.locator('.composer-settings summary').click();await page.screenshot({path:'/tmp/magic-canvas-settings.png'});await page.click('#settings-close');
  await page.click('#composer-generate');await page.waitForFunction(()=>__qa.get('submissions',[]).length===2);
  assert.equal(await page.locator('[data-type=output]').count(),2,'x2 must reuse the existing Output');
  await page.waitForTimeout(5000);assert.equal((await metrics()).writes,0,'submission and polling must not write Firestore');assert.equal((await metrics()).reads,0,'submission and polling must not read Firestore');
  const submits=await page.evaluate(()=>__qa.get('submissions',[]));assert.ok(submits.every(x=>x.body.content[0].text.includes(longPrompt.trim())));assert.ok(submits.every(x=>x.body.generate_audio===false&&x.body.resolution==='1080p'&&x.body.duration===10));
  await page.evaluate(()=>__qa.put('taskStatus','completed'));await page.waitForFunction(()=>Object.keys(__qa.get('docs',{})).filter(k=>k.startsWith('videos/')).length===3,{},{timeout:15000});
  await page.waitForFunction(()=>__qa.get('docs',{})['spaces/first'].canvasState?.state?.nodes.filter(n=>n.type==='output'&&n.fields.status==='completed').length===2);
  const score=await page.evaluate(()=>__qa.get('docs',{})['leaderboard/alice']);assert.equal(score.completed,2);assert.equal(score.xp,100);
  await page.reload();await page.locator('[data-node=G1] textarea').waitFor();assert.equal(await page.locator('[data-type=output]').count(),2);assert.ok((await page.locator('[data-node=G1] textarea').inputValue()).includes('cinematic'));
  await page.locator('[data-node=G1] textarea').fill('Saved by F5');await page.reload();await page.locator('[data-node=G1] textarea').waitFor();assert.equal(await page.locator('[data-node=G1] textarea').inputValue(),'Saved by F5');
  assert.equal(await page.evaluate(()=>__qa.get('docs',{})['spaces/first'].canvasState.state.nodes.find(n=>n.id==='G1').fields.prompt),'Saved by F5');
  await page.locator('[data-node=G1] textarea').click();await page.locator('[data-panel-field=batch]').selectOption('1');await page.evaluate(()=>__qa.put('taskStatus','failed'));await page.click('#composer-generate');
  await page.waitForFunction(()=>__qa.get('docs',{})['leaderboard/alice'].failed===1,{},{timeout:15000});assert.equal(await page.locator('[data-type=output]').count(),2,'repeat generation reuses Output');
  assert.equal((await metrics()).storage,0,'completed videos must not be copied to Firebase Storage');
  // Local media survives a page reload and is registered only at the checkpoint.
  await page.click('#add-toggle');await page.click('[data-add=media]');await page.locator('[data-type=media] input[data-upload]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets.some(a=>a.name==='reference.png'&&!a.uploading));
  await page.reload();await page.locator('[data-type=media] img').waitFor();assert.ok(await page.locator('[data-type=media] img').getAttribute('src'));
  await reset();
  const spark=await page.evaluate(async()=>{
    const state=JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first'));
    const image=await Studio.ensureRemoteAsset(state.assets.find(a=>a.name==='reference.png'));
    await Studio.uploadProfilePhoto(new File(['test'], 'avatar.png',{type:'image/png'}));
    const video=await Studio.storeLocalAsset(new File(['test'], 'clip.mp4',{type:'video/mp4'}),'first');let message;
    try{await Studio.ensureRemoteAsset(video);}catch(e){message=e.message;}
    return {reference:image.referenceUrl,photo:Studio.current().photoURL,message};
  });assert.ok(spark.reference.startsWith('data:image/png;base64,'));assert.ok(spark.photo.startsWith('blob:'));assert.ok(spark.message.includes('HTTPS'));assert.equal((await metrics()).storage,0);assert.equal((await metrics()).writes,0);assert.equal((await metrics()).reads,0);
  const mediaHeader=await page.locator('[data-node=M1] .node-header').boundingBox();await page.mouse.move(mediaHeader.x+30,mediaHeader.y+10);await page.mouse.down();await page.mouse.move(mediaHeader.x-270,mediaHeader.y-190,{steps:10});await page.mouse.up();
  await page.locator('[data-node=G1] textarea').click();await page.locator('#generation-composer input[type=file]').setInputFiles({name:'generation-ref.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets.some(a=>a.name==='generation-ref.png'&&!a.uploading));
  await page.evaluate(()=>__qa.put('taskStatus','completed'));await page.click('#composer-generate');await page.waitForFunction(()=>__qa.get('docs',{})['leaderboard/alice'].completed===3,{},{timeout:15000});
  await page.waitForFunction(()=>__qa.get('docs',{})['spaces/first'].canvasState.assets.some(a=>a.name==='generation-ref.png'));
  const saved=await page.evaluate(()=>({docs:__qa.get('docs',{}),last:__qa.get('submissions',[]).at(-1)}));
  assert.ok(saved.last.body.content.some(c=>c.type==='image_url'&&c.image_url.url.startsWith('data:image/png;base64,')));
  const completed=Object.values(saved.docs).filter(v=>v.uid==='alice'&&v.status==='completed');assert.ok(completed.every(v=>v.videoUrl===base+'qa-result.mp4'&&v.storagePath===null&&v.providerUrlExpiresAt>Date.now()));
  assert.ok(!JSON.stringify(saved.docs).includes('data:image/'),'Firestore must never receive reference bytes');assert.equal((await metrics()).storage,0);assert.equal(await page.locator('.output-download:visible').count(),2);
  // The link action supports a video reference without any cloud upload.
  page.once('dialog',dialog=>dialog.accept('https://cdn.example.test/reference.mp4'));await page.locator('[data-type=media] [data-add-url]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets.some(a=>a.url==='https://cdn.example.test/reference.mp4'));
  await page.goto(base+'users.html');await page.locator('.team-row').first().waitFor();
  await page.locator('#create-user-form [name=displayName]').fill('New colleague');await page.locator('#create-user-form [name=email]').fill('new@example.test');await page.locator('#create-user-form [name=password]').fill('not-a-real-password');await page.locator('#create-user-form [name=role]').selectOption('superuser');await page.locator('#create-user-form [type=submit]').click();await page.waitForFunction(()=>Object.values(__qa.get('docs',{})).some(v=>v.displayName==='New colleague'&&v.role==='superuser'));assert.equal(await page.evaluate(()=>Studio.current().uid),'alice');
  await page.locator('.team-row').filter({hasText:'Bob'}).locator('select').selectOption('superuser');await page.waitForFunction(()=>__qa.get('docs',{})['users/bob'].role==='superuser');
  await page.goto(base+'index.html');await page.locator('#report-rows tr').first().waitFor();assert.ok((await page.locator('#report-rows').textContent()).includes('Bob'));
  await page.goto(base+'assets.html');await page.locator('.asset-card').first().waitFor();assert.equal(await page.locator('.asset-card').count(),5);assert.equal(await page.locator('a[href*="space=private"]').count(),0);
  await page.goto(base+'winners.html');await page.locator('.rank-row').first().waitFor();await page.locator('#xp-seconds').fill('20');await page.locator('#xp-resolution').selectOption('1080p');await page.locator('#xp-refs').fill('10');assert.equal(await page.locator('#xp-result').textContent(),'235');await page.screenshot({path:'/tmp/magic-winners.png'});
  await page.evaluate(()=>{const docs=__qa.get('docs',{});docs['users/bob'].role='user';__qa.put('docs',docs);__qa.put('uid','bob');});
  await page.goto(base+'spaces.html');await page.locator('.space-row').first().waitFor();assert.equal(await page.locator('.space-row').count(),1);assert.ok((await page.locator('#spaces-list').textContent()).includes('BOB PRIVATE'));assert.equal(await page.locator('[data-superuser-only]:visible').count(),0);
  await page.goto(base+'assets.html');await page.locator('.asset-card').first().waitFor();assert.equal(await page.locator('.asset-card').count(),1);
  await page.goto(base+'index.html');await page.locator('#report-rows tr').first().waitFor();assert.equal(await page.locator('#report-rows tr').count(),1);assert.ok(!(await page.locator('#report-rows').textContent()).includes('Dan'));
  await page.goto(base+'winners.html');await page.locator('.rank-row').first().waitFor();assert.ok((await page.locator('#xp-ranking').textContent()).includes('Dan'));
  await page.goto(base+'users.html');await page.getByText('Доступ только для суперадмина.',{exact:true}).waitFor();
  await reset();const retry=await page.evaluate(async()=>{
    __qa.put('taskStatus','network');let row=await Studio.createVideoRecord({prompt:'Offline test',seconds:4});row=await Studio.updateVideo(row.id,{requestId:'offline-job',status:'running'});
    try{await Studio.watchGeneration(row,()=>{},{interval:1});}catch{}return Studio.getVideo(row.id);
  });assert.equal(retry.status,'running','network problems must not be recorded as generation failures');assert.equal((await metrics()).writes,0);assert.equal((await metrics()).reads,0);
  assert.deepEqual(errors,[]);console.log('PASS browser: scoped roles, reports, local edits, 0 Firestore during submit/poll, drag menus, Output reuse, batching, reload, local media, Base64 refs, provider-only video links, zero Storage, full presets, settings, Winners.');
}catch(error){await page.screenshot({path:'/tmp/magic-browser-failure.png'});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();server.close();}
