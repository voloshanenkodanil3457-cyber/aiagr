import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const playwright=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const portrait=await fs.readFile(path.join(root,'tests/fixtures/video-portrait.mp4')),landscape=await fs.readFile(path.join(root,'tests/fixtures/video-landscape.mp4'));
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(root+path.sep))throw new Error('path');res.setHeader('Content-Type',target.endsWith('.html')?'text/html':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`,gateway='https://video-worker.test';
const context=await browser.newContext({viewport:{width:1500,height:1050},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));await context.addInitScript({path:path.join(root,'tests/firebase-mock.js')});
const functions=['initializeApp','deleteApp','getAuth','setPersistence','onAuthStateChanged','signInWithEmailAndPassword','createUserWithEmailAndPassword','signOut','deleteUser','getFirestore','getStorage','doc','collection','query','where','getDoc','getDocs','setDoc','updateDoc','deleteDoc','writeBatch','runTransaction','ref','uploadBytes','getDownloadURL','deleteObject'];
const module=functions.map(f=>`export const ${f}=(...args)=>window.__qa.sdk.${f}(...args);`).join('\n')+'\nexport const browserLocalPersistence="local",inMemoryPersistence="memory";';
const model={id:'bytedance/seedance-2.5',supported_durations:Array.from({length:27},(_,i)=>i+4),supported_resolutions:['480p','720p'],supported_aspect_ratios:['16:9','4:3','1:1','3:4','9:16','21:9']};
let completed=false,nextTask=0;
const media=async(route,bytes=portrait)=>{const range=route.request().headers().range,match=range?.match(/^bytes=(\d+)-(\d*)$/),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:match?206:200,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*',...(match?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})},body:bytes.subarray(start,end+1)});};
await context.route('**/*',async route=>{
  const req=route.request(),url=req.url(),pathname=new URL(url).pathname,send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:module});
  if(url.startsWith('https://aicameramovements.com/previews/')){
    let bytes=landscape;if(process.env.CAMERA_QA_REAL_PREVIEWS){const id=pathname.match(/hq\/(01|02|2b|03)-/)?.[1];if(id)bytes=await fs.readFile('/tmp/magic-camera-'+({ '2b':'02b'}[id]||id)+'.mp4');}return media(route,bytes);
  }
  if(url.startsWith('https://openrouter.ai/api/v1/')){
    calls.push({provider:'openrouter',path:pathname,method:req.method(),body:req.method()==='POST'?req.postDataJSON():null});
    assert.equal(req.headers().authorization,'Bearer TEST-OPENROUTER');
    if(pathname==='/api/v1/key')return send({data:{limit_remaining:30,is_free_tier:false}});
    if(pathname==='/api/v1/videos/models')return send({data:[model]});
    if(pathname.endsWith('/content'))return media(route);
    if(req.method()==='POST')return send({id:'direct-'+(++nextTask),status:'pending'});
    return send(completed?{status:'completed',duration:8,resolution:'720p',usage:{cost:.42}}:{status:'in_progress',progress:35});
  }
  if(url.startsWith(gateway)){
    if(pathname.startsWith('/openrouter/media/'))return media(route);
    assert.equal(req.headers().authorization,'Bearer test-id-token');calls.push({provider:'worker',path:pathname,method:req.method(),body:req.postDataJSON()});
    if(pathname==='/byteplus/session')return send({sessionToken:'mock-superuser-session',expiresAt:Date.now()+3600000});
    assert.equal(req.headers()['x-magic-session'],'mock-superuser-session');
    if(pathname==='/openrouter/test')return send({data:{limit_remaining:30}});
    if(pathname==='/openrouter/models')return send({data:[model]});
    if(pathname==='/openrouter/submit')return send({id:'worker-'+(++nextTask),taskToken:'sealed-task-receipt'});
    if(pathname==='/openrouter/status')return send({status:'completed',duration:8,resolution:'720p',usage:{cost:.35}});
    if(pathname==='/openrouter/playback')return send({url:gateway+'/openrouter/media/'+req.postDataJSON().taskId+'?token=short-lived-playback',expiresAt:Date.now()+1800000});
    throw new Error('Unexpected Worker request '+pathname);
  }
  if(url.includes('ark.ap-southeast.bytepluses.com')){calls.push({provider:'byteplus',path:pathname,method:req.method()});throw new Error('OpenRouter flow must not call BytePlus');}
  if(url===base+'fixture-bob.mp4')return media(route,landscape);
  if(url.startsWith(base))return route.continue();return route.abort();
});
const ready=()=>page.waitForFunction(()=>window.Studio?.current());
const metrics=()=>page.evaluate(()=>__qa.get('metrics',{}));
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')));
const modal=()=>page.locator('.media-preview-dialog');
const waitVideo=()=>page.waitForFunction(()=>document.querySelector('.media-preview-dialog video')?.videoWidth>0);
const connect=async(from,to)=>{const a=await page.locator(`[data-node=${from}] .port.out`).boundingBox(),b=await page.locator(`[data-node=${to}] .port.in`).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.mouse.up();};
const fastPolling=()=>page.evaluate(()=>{const original=Studio.watchGeneration;Studio.watchGeneration=(record,update,options)=>original(record,update,{...options,interval:80});});
try{
  await page.goto(base+'integrations.html');await ready();await page.locator('#byteplus-remove').waitFor({state:'visible'});
  await page.locator('#openrouter-api-key').fill('TEST-OPENROUTER');await page.click('#openrouter-save');await page.locator('#openrouter-enable').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>Studio.activeVideoProvider()),'byteplus','saving a second key must not switch the active API');
  await page.click('#openrouter-test');await page.waitForFunction(()=>Studio.integrationVerified('openrouter'));
  assert.equal(calls.filter(c=>c.method==='POST').length,0,'key verification must not generate a billable video');
  await page.click('#openrouter-enable');await page.locator('#openrouter-active').waitFor({state:'visible'});assert.equal(await page.locator('#byteplus-active').isVisible(),false);
  await page.click('#openrouter-remove');assert.equal(await page.evaluate(()=>Studio.activeVideoProvider()),null);assert.equal(await page.evaluate(()=>localStorage.getItem('magic.credentials.alice.openrouter.apiKey')),'TEST-OPENROUTER');
  await page.click('#byteplus-enable');await page.locator('#byteplus-active').waitFor({state:'visible'});await page.click('#openrouter-enable');await page.locator('#openrouter-active').waitFor({state:'visible'});
  await page.screenshot({path:'/tmp/magic-refresh-providers.png'});

  await page.goto(base+'modifiers.html');await ready();await page.locator('.camera-card').first().waitFor();assert.equal(await page.locator('.camera-card').count(),46);
  await page.waitForFunction(()=>document.querySelector('.camera-preview video').videoWidth>0);await page.screenshot({path:'/tmp/magic-refresh-camera-dark.png',fullPage:false});
  await page.click('[data-category="Dolly/Track"]');assert.equal(await page.locator('.camera-card').count(),9);await page.click('[data-category=all]');await page.locator('#camera-search').fill('orbit');assert.equal(await page.locator('.camera-card').count(),2);await page.locator('#camera-search').fill('');
  const clip=await page.evaluate(()=>MagicCameraMovements.get('01'));await page.locator('[data-camera-id="01"]').getByRole('button',{name:'Copy prompt',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),clip.prompt);
  await page.locator('[data-camera-id="01"]').getByRole('button',{name:'Turn into video ↗',exact:true}).click();await page.locator('.camera-space-dialog select option').waitFor({state:'attached'});assert.equal(await page.locator('.camera-space-dialog select option').count(),1);assert.equal(await page.locator('.camera-space-dialog select').inputValue(),'first');
  await page.getByRole('button',{name:'Добавить пресет камеры',exact:true}).click();await page.waitForURL('**/nodes.html?space=first');await page.locator('[data-camera=true]').waitFor();assert.equal(await page.locator('[data-type=preset]').count(),1);assert.equal((await state()).state.nodes[0].fields.text,clip.prompt);
  await page.reload();await page.locator('[data-camera=true]').waitFor();assert.equal(await page.locator('[data-type=preset]').count(),1,'refresh must not duplicate an imported camera');
  await page.waitForFunction(()=>document.querySelector('[data-camera=true] .camera-node-preview video')?.videoWidth>0);
  assert.equal(await page.locator('[data-camera=true] .camera-node-preview video').getAttribute('src'),clip.url);
  await page.locator('[data-camera=true] .camera-node-preview video').evaluate(v=>v.play());
  await page.waitForFunction(()=>document.querySelector('[data-camera=true] .camera-node-preview video').currentTime>0);
  await page.locator('[data-camera=true] .camera-node-preview video').evaluate(v=>v.pause());
  await page.screenshot({path:path.join(root,'../camera-node-preview.png')});
  await page.evaluate(()=>__qa.reset());await page.click('#add-toggle');await page.click('[data-add=generation]');await page.locator('[data-node=G1] textarea').fill('A quiet cinematic landscape');await page.click('#composer-prompt');
  await page.locator('.composer-settings summary').click();assert.equal(await page.locator('[data-setting=resolution][data-value="1080p"]').isDisabled(),true);await page.click('[data-setting=ratio][data-value="9:16"]');await page.click('#settings-close');
  // Hide the composer while connecting the camera's output to generation input.
  await page.locator('[data-node=P1] .node-header').click();await connect('P1','G1');await page.locator('[data-node=G1] textarea').click();
  assert.ok((await page.locator('#compiled-prompt').textContent()).includes(clip.prompt));
  const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
  await page.locator('#generation-composer input[type=file]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:photo});await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets.some(a=>!a.uploading));
  assert.equal((await metrics()).reads,0);assert.equal((await metrics()).writes,0,'camera links, settings and image upload stay local');assert.equal((await metrics()).storage,0);
  await fastPolling();await page.click('#composer-generate');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).state.nodes.some(n=>n.type==='output'&&n.fields.requestId));
  const submit=calls.find(c=>c.provider==='openrouter'&&c.method==='POST');assert.equal(submit.body.model,model.id);assert.ok(submit.body.prompt.includes(clip.prompt));assert.ok(submit.body.input_references[0].image_url.url.startsWith('data:image/png;base64,'));assert.equal(submit.body.aspect_ratio,'9:16');
  assert.equal((await metrics()).writes,0);await page.evaluate(()=>Studio.setVideoProvider('byteplus'));completed=true;
  await page.waitForFunction(()=>Object.values(__qa.get('docs',{})).some(v=>v.requestId==='direct-1'&&v.status==='completed'));
  const result=await page.evaluate(()=>Object.entries(__qa.get('docs',{})).find(([k,v])=>k.startsWith('videos/')&&v.requestId==='direct-1')[1]);assert.equal(result.provider,'openrouter');assert.equal(result.model,model.id);assert.equal(result.cost,.42);assert.equal(result.storagePath,null);assert.equal(result.providerUrlExpiresAt,null);
  assert.equal(calls.filter(c=>c.provider==='byteplus').length,0,'provider switch must not move an existing OpenRouter job to BytePlus');assert.equal((await metrics()).storage,0);
  const outputDownload=await page.locator('.output-download').boundingBox(),outputVideo=await page.locator('.output-video').boundingBox();
  assert.ok(outputDownload.y>=outputVideo.y+outputVideo.height,'download must stay below the video controls');
  const inlineDownload=page.waitForEvent('download');await page.locator('.output-download').click();assert.ok((await inlineDownload).suggestedFilename().endsWith('.mp4'));
  await page.locator('.output-expand').click();await waitVideo();assert.equal(await modal().getByRole('button',{name:'Промпт',exact:true}).count(),0);assert.equal(await modal().getByRole('button',{name:'Описание',exact:true}).count(),0);
  const proportions=await page.evaluate(()=>{const v=document.querySelector('.media-preview-stage video'),r=v.getBoundingClientRect();return {actual:v.videoWidth/v.videoHeight,rendered:r.width/r.height,blur:getComputedStyle(document.querySelector('.media-preview-dialog'),'::backdrop').backdropFilter};});assert.ok(Math.abs(proportions.actual-proportions.rendered)<.01);assert.ok(proportions.blur.includes('blur'));
  await page.screenshot({path:'/tmp/magic-refresh-output-preview.png'});const download=page.waitForEvent('download');await modal().getByRole('button',{name:'↓ Скачать видео',exact:true}).click();assert.ok((await download).suggestedFilename().endsWith('.mp4'));await page.keyboard.press('Escape');await modal().waitFor({state:'detached'});assert.equal(await page.locator('[data-type=output]').count(),1,'Escape in a dialog must not remove a canvas node');

  const longPrompt='BOB FULL CAMERA PROMPT. '.repeat(240);await page.evaluate(({url,prompt})=>{const d=__qa.get('docs',{});Object.assign(d['videos/bob-video'],{videoUrl:url,prompt,provider:'byteplus',model:'dreamina-seedance-2-5-260628',ratio:'16:9',generateAudio:false});__qa.put('docs',d);},{url:base+'fixture-bob.mp4',prompt:longPrompt});
  await page.goto(base+'assets.html');await ready();await page.getByRole('button',{name:'Предпросмотр видео · Bob',exact:true}).waitFor();assert.equal(await page.locator('.asset-card').count(),2,'superuser must see their own and Bob videos');
  await page.getByRole('button',{name:'Предпросмотр видео · Bob',exact:true}).click();await waitVideo();await modal().getByRole('button',{name:'Промпт',exact:true}).click();assert.equal(await modal().locator('.media-preview-prompt').textContent(),longPrompt);
  assert.equal(await modal().locator('#video-preview-prompt').evaluate(el=>el.scrollHeight>el.clientHeight),true);await modal().locator('.media-preview-prompt').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),longPrompt);
  await modal().getByRole('button',{name:'Описание',exact:true}).click();assert.ok((await modal().locator('.media-preview-info').textContent()).includes('Bob'));assert.ok((await modal().locator('.media-preview-info').textContent()).includes('Без звука'));await page.screenshot({path:'/tmp/magic-refresh-assets-preview.png'});await page.keyboard.press('Escape');

  await page.goto(base+'integrations.html');await ready();await page.locator('#openrouter-worker-url').fill(gateway);await page.click('#openrouter-save');await page.waitForFunction(()=>Studio.openRouterGateway()==='https://video-worker.test');await page.click('#openrouter-test');await page.waitForFunction(()=>Studio.integrationVerified('openrouter'));await page.click('#openrouter-enable');await page.locator('#openrouter-active').waitFor({state:'visible'});
  await page.goto(base+'nodes.html?space=first');await page.locator('[data-node=G1] textarea').waitFor();await page.locator('[data-node=G1] textarea').click();await fastPolling();await page.click('#composer-generate');await page.waitForFunction(()=>Object.values(__qa.get('docs',{})).some(v=>v.requestId==='worker-2'&&v.status==='completed'));
  assert.equal(await page.locator('[data-type=output]').count(),1,'Worker generation reuses the existing Output');const workerResult=await page.evaluate(()=>Object.values(__qa.get('docs',{})).find(v=>v.requestId==='worker-2'));assert.equal(workerResult.transport,'worker');assert.equal(workerResult.taskToken,'sealed-task-receipt');assert.equal(workerResult.gatewayUrl,gateway);
  await page.evaluate(({gateway,model})=>{const d=__qa.get('docs',{});d['videos/bob-worker']={...d['videos/bob-video'],provider:'openrouter',transport:'worker',gatewayUrl:gateway,requestId:'bob-worker-1',taskToken:'bob-sealed-receipt',videoUrl:'https://openrouter.ai/api/v1/videos/bob-worker-1/content?index=0',model,ratio:'9:16',createdAt:Date.now()};__qa.put('docs',d);},{gateway,model:model.id});
  await page.goto(base+'assets.html');await ready();await page.getByRole('button',{name:'Предпросмотр видео · Bob',exact:true}).first().click();await waitVideo();assert.ok(await modal().locator('video').getAttribute('src').then(s=>s.includes('/openrouter/media/bob-worker-1')));await page.keyboard.press('Escape');
  const privacy=await page.evaluate(async()=>{const d=__qa.get('docs',{});const tampered={...d['videos/bob-worker'],id:'untrusted-test',gatewayUrl:'https://untrusted.test'};try{await Studio.resolveVideoSource(tampered);}catch(e){return e.message;}});assert.ok(privacy.includes('тот же Worker'));
  assert.equal(await page.evaluate(()=>JSON.stringify(__qa.get('docs',{})).includes('TEST-OPENROUTER')),false,'API keys must never enter Firestore');

  await page.evaluate(()=>{const d=__qa.get('docs',{});d['videos/bob-failed']={uid:'bob',user:'Bob failed',status:'failed',prompt:'FAILED PROMPT',error:'provider failed',createdAt:Date.now()};__qa.put('docs',d);});
  await page.reload();await page.locator('.asset-card').filter({hasText:'FAILED PROMPT'}).waitFor();
  const failedCard=page.locator('.asset-card').filter({hasText:'FAILED PROMPT'});
  page.once('dialog',d=>d.dismiss());await failedCard.getByRole('button',{name:'Удалить из базы',exact:true}).click();assert.equal(await failedCard.count(),1);
  page.once('dialog',d=>d.accept());await failedCard.getByRole('button',{name:'Удалить из базы',exact:true}).click();await failedCard.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>__qa.get('docs',{})['videos/bob-failed']),undefined);
  assert.deepEqual(await page.evaluate(()=>__qa.get('docs',{})['videoDeletions/bob-failed']),{uid:'bob'});
  const originalScore=await page.evaluate(()=>__qa.get('docs',{})['leaderboard/bob']);
  await page.evaluate(()=>Studio.permanentlyDeleteVideo('bob-video'));await page.reload();await ready();
  assert.deepEqual(await page.evaluate(()=>__qa.get('docs',{})['leaderboard/bob']),originalScore);

  await page.goto(base+'modifiers.html');await ready();await page.evaluate(()=>Studio.applyTheme('light'));await page.screenshot({path:'/tmp/magic-refresh-camera-light.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/magic-refresh-camera-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'camera page must fit a phone');
  await page.evaluate(()=>__qa.put('uid','bob'));await page.goto(base+'assets.html');await ready();await page.getByRole('button',{name:'Предпросмотр видео · Bob',exact:true}).first().waitFor();assert.equal(await page.locator('.asset-card').count(),1,'regular users see only their remaining own video');assert.ok(!(await page.locator('#assets-grid').textContent()).includes('A quiet cinematic landscape'));
  assert.equal(await page.getByRole('button',{name:'Удалить из базы',exact:true}).count(),0);
  assert.ok((await page.evaluate(async()=>{try{await Studio.permanentlyDeleteVideo('bob-worker');}catch(e){return e.message;}})).includes('суперадмину'));
  await page.getByRole('button',{name:'Предпросмотр видео · Bob',exact:true}).first().click();await waitVideo();assert.equal(await page.evaluate(()=>{const r=document.querySelector('.media-preview-dialog').getBoundingClientRect();return r.width>innerWidth||r.height>innerHeight;}),false,'portrait preview must fit a phone');await page.keyboard.press('Escape');
  await page.goto(base+'spaces.html');await ready();await page.locator('.space-row').waitFor();assert.equal(await page.locator('.space-row').count(),1);assert.ok((await page.locator('#spaces-list').textContent()).includes('BOB PRIVATE'));
  assert.deepEqual(errors,[]);console.log('PASS refresh UI: exclusive providers, read-only key test, 46 camera moves/search/copy/private-space import, complete linked prompts, original image references, local editing, old-provider polling, Worker receipts and team preview, exact video ratio/download/blur/full prompts, phone/light theme and owner isolation.');
}catch(error){await page.screenshot({path:'/tmp/magic-refresh-browser-failure.png'});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();server.close();}
