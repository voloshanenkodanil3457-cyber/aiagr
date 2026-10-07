import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const playwright=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(root+path.sep))throw new Error('path');res.setHeader('Content-Type',target.endsWith('.html')?'text/html':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`,gateway='https://portrait-worker.test';
const context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage(),errors=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));await context.addInitScript({path:path.join(root,'tests/firebase-mock.js')});
await context.addInitScript(url=>localStorage.setItem('magic.credentials.alice.gateway',url),gateway);
const functions=['initializeApp','deleteApp','getAuth','setPersistence','onAuthStateChanged','signInWithEmailAndPassword','createUserWithEmailAndPassword','signOut','deleteUser','getFirestore','getStorage','doc','collection','query','where','getDoc','getDocs','setDoc','updateDoc','deleteDoc','writeBatch','runTransaction','ref','uploadBytes','getDownloadURL','deleteObject'];
const module=functions.map(f=>`export const ${f}=(...args)=>window.__qa.sdk.${f}(...args);`).join('\n')+'\nexport const browserLocalPersistence="local",inMemoryPersistence="memory";';
let assetStatus='Processing',createLost=false;
await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:module});
  if(url.startsWith(gateway)){
    assert.equal(req.headers().authorization,'Bearer test-id-token');
    const pathname=new URL(url).pathname,body=pathname.endsWith('/upload')?null:req.postDataJSON();calls.push({pathname,body,bytes:req.postDataBuffer()});
    const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(pathname==='/byteplus/session')return send({sessionToken:'member',expiresAt:Date.now()+3600000});
    assert.equal(req.headers()['x-magic-session'],'member');
    if(pathname.endsWith('/config'))return send({ready:true,localUploads:true});
    if(pathname.endsWith('/groups/create'))return send({id:'group-ai',name:body.name,type:'AIGC',token:'group-receipt'});
    if(pathname.endsWith('/verify/start'))return send({h5Link:'https://verification.test/check',sessionToken:'verification-receipt'});
    if(pathname.endsWith('/verify/finish'))return send({id:'group-person',type:'LivenessFace',token:'human-receipt'});
    if(pathname.endsWith('/upload'))return send({url:'https://portrait-worker.test/temporary-photo',fileToken:'file-receipt'});
    if(pathname.endsWith('/assets/create'))return createLost?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Registration response lost"}'}):send({id:'asset-photo',groupId:'group-ai',token:'asset-receipt'});
    if(pathname.endsWith('/assets/status'))return send({status:assetStatus,assetType:'Image',error:assetStatus==='Failed'?'Portrait rejected':null});
    if(pathname.endsWith('/assets/connect'))return send({id:body.id,groupId:'group-ai',token:'recovered-receipt'});
    if(pathname==='/byteplus/submit')return send({id:'generation-1',taskToken:'task-receipt'});
    if(pathname==='/byteplus/status')return send({status:'running'});
    throw new Error('Unexpected gateway route '+pathname);
  }
  if(url.startsWith('https://verification.test/'))return route.fulfill({contentType:'text/html',body:'Verification mock'});
  if(url.startsWith(base))return route.continue();return route.abort();
});
const count=p=>calls.filter(c=>c.pathname.endsWith(p)).length;
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
const dialog=()=>page.locator('.portrait-dialog');
try{
  await page.goto(base+'nodes.html?space=first');await page.locator('#empty-state button').waitFor();
  await page.click('#add-toggle');await page.click('[data-add="generation"]');await page.locator('[data-node=G1] textarea').fill('Fictional character in a film');
  await page.locator('#generation-composer input[type=file]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:photo});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets.some(a=>a.name==='portrait.png'&&!a.uploading));
  await page.getByRole('button',{name:'Портрет: portrait.png',exact:true}).click();await dialog().getByPlaceholder('Имя человека или AI-персонажа').fill('Fictional hero');
  await dialog().getByRole('button',{name:'Новый AI-персонаж',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.portrait-dialog select').value==='group-ai');
  await dialog().getByRole('button',{name:'Привязать группу к фото',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets[0]?.portraitGroupId==='group-ai');
  await page.screenshot({path:'/tmp/magic-portrait-dialog.png'});await dialog().getByRole('button',{name:'×',exact:true}).click();
  await page.evaluate(()=>__qa.reset());await page.click('#composer-generate');
  await page.waitForFunction(()=>document.querySelector('#composer-generate').disabled);await new Promise(r=>setTimeout(r,500));
  assert.equal(count('/upload'),1);assert.equal(count('/assets/create'),1);assert.equal(count('/submit'),0,'Processing asset must hold inference');
  const sent=page.waitForResponse(r=>r.url()===gateway+'/byteplus/submit',{timeout:12000});assetStatus='Active';await sent;
  assert.equal(count('/submit'),1);const submit=calls.find(c=>c.pathname==='/byteplus/submit').body.payload;
  assert.deepEqual(submit.reference_images,['asset://asset-photo']);assert.deepEqual(submit.asset_receipts,{'asset-photo':'asset-receipt'});
  assert.ok(!calls.find(c=>c.pathname.endsWith('/assets/create')).body.url.startsWith('data:'));
  assert.equal(await page.evaluate(()=>__qa.get('metrics').storage),0);assert.equal(await page.evaluate(()=>__qa.get('metrics').writes),0);
  const reused=await page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets[0];return Studio.ensureRemoteAsset(a);});
  assert.equal(reused.referenceUrl,'asset://asset-photo');assert.equal(count('/assets/create'),1,'same file/group must reuse registration');assert.equal(count('/upload'),1);
  await page.reload();await page.locator('[data-node=G1] textarea').waitFor();await page.locator('[data-node=G1] textarea').click();
  assert.equal(await page.getByRole('button',{name:'Портрет: portrait.png',exact:true}).textContent(),'Портрет ✓');
  await page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets[0];await Studio.ensureRemoteAsset(a);});assert.equal(count('/assets/create'),1);
  assetStatus='Failed';const rejected=await page.evaluate(async()=>{try{await Studio.ensureRemoteAsset(JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets[0]);}catch(e){return e.message;}});
  assert.ok(rejected.includes('Portrait rejected'));assert.equal(count('/submit'),1);
  // Lost CreateAsset response is persisted; no automatic POST retry on the next click.
  createLost=true;
  await page.evaluate(async bytes=>{window.__newPhoto=await Studio.storeLocalAsset(new File([new Uint8Array(bytes)],'new-portrait.png',{type:'image/png'}),'first');__newPhoto=await Studio.setPortraitGroup(__newPhoto,'group-ai');},[...photo,1]);
  const unknown=()=>page.evaluate(async()=>{try{await Studio.ensureRemoteAsset(__newPhoto);}catch(e){return e.message;}});
  assert.ok((await unknown()).includes('lost'));const created=count('/assets/create');assert.ok((await unknown()).includes('Автоматический повтор'));assert.equal(count('/assets/create'),created);
  await page.evaluate(()=>MagicPortraits.manage(__newPhoto,a=>__newPhoto=a));await dialog().getByPlaceholder('asset-…').fill('asset-recovered');await dialog().getByRole('button',{name:'Подключить уже зарегистрированное фото',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.portrait-dialog').textContent.includes('Asset ID сохранён'));await dialog().getByRole('button',{name:'×',exact:true}).click();
  assetStatus='Active';assert.equal((await page.evaluate(()=>Studio.ensureRemoteAsset(__newPhoto))).referenceUrl,'asset://asset-recovered');assert.equal(count('/assets/create'),created);
  // The UI asks the human to complete a separate verification and then queries its result.
  await page.getByRole('button',{name:'Портрет: portrait.png',exact:true}).click();await dialog().getByPlaceholder('Имя человека или AI-персонажа').fill('Verified person');
  const popupPromise=page.waitForEvent('popup');await dialog().getByRole('button',{name:'Проверить реального человека',exact:true}).click();const popup=await popupPromise;
  await page.waitForFunction(()=>!document.querySelector('.portrait-dialog').querySelector('button:nth-child(3)')?.disabled);await dialog().getByRole('button',{name:'Проверить результат',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.portrait-dialog select').value==='group-person');assert.equal(calls.find(c=>c.pathname.endsWith('/verify/finish')).body.sessionToken,'verification-receipt');await popup.close();
  await dialog().getByRole('button',{name:'Использовать фото напрямую',exact:true}).click();
  await dialog().waitFor({state:'detached'});
  const raw=await page.evaluate(()=>Studio.ensureRemoteAsset(JSON.parse(localStorage.getItem('magic.canvas.cache.v1.alice.first')).assets[0]));assert.ok(raw.referenceUrl.startsWith('data:image/png;base64,'));
  // User and gateway changes cannot reuse local receipts from another scope.
  const isolated=await page.evaluate(async()=>{localStorage.setItem('magic.credentials.alice.gateway','https://another-worker.test');try{await Studio.ensureRemoteAsset(__newPhoto);}catch(e){return e.message;}});assert.ok(isolated.includes('подключи группу'));
  assert.deepEqual(errors,[]);console.log('PASS portrait UI: group selection, Processing→Active→asset inference, reload/deduplication, failure blocks, lost response recovery, human verification, raw Base64, gateway isolation.');
}catch(error){await page.screenshot({path:'/tmp/magic-portrait-browser-failure.png'});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();server.close();}
