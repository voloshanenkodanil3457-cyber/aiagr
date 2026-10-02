'use strict';
window.Studio=(()=>{
  const CFG=window.MAGIC_APP_CONFIG||window.PICASSO_APP_CONFIG||{firebaseSdkVersion:'10.12.0',apiGatewayUrl:''};
  const FBCFG=window.MAGIC_FIREBASE_CONFIG||window.PICASSO_FIREBASE_CONFIG;
  const sdk=CFG.firebaseSdkVersion||'10.12.0';
  const cache={user:null,profile:null,folders:[],presets:[],integrations:new Map(),firebaseError:null};
  let api=null,readyResolve;
  const readyPromise=new Promise(r=>readyResolve=r);
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now=()=>Date.now();
  const safeName=value=>String(value||'').trim().replace(/[\\/:*?"<>|]+/g,'-').slice(0,120)||'file';
  const read=(key,fallback,storage=localStorage)=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback;}catch{return fallback;}};
  const write=(key,value,storage=localStorage)=>{storage.setItem(key,JSON.stringify(value));};
  const isAdmin=()=>cache.profile?.role==='superuser';
  const current=()=>cache.profile?{id:cache.user?.uid,uid:cache.user?.uid,email:cache.user?.email||cache.profile.email,name:cache.profile.displayName||cache.user?.displayName||cache.user?.email?.split('@')[0]||'User',role:cache.profile.role||'user',telegram:cache.profile.telegram||'',photoURL:cache.localPhotoURL||cache.profile.photoURL||''}:null;
  function notify(message,type='info'){
    let box=document.querySelector('#app-notice');
    if(!box){box=el('div',undefined,'app-notice');box.id='app-notice';box.setAttribute('role','status');document.body.append(box);}
    box.dataset.type=type;box.textContent=message;box.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>box.hidden=true,4800);
  }
  function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function timestamp(value){if(value==null)return 0;if(typeof value==='number')return value;if(typeof value==='string'){const n=Date.parse(value);return Number.isFinite(n)?n:0;}if(typeof value?.toMillis==='function')return value.toMillis();return 0;}

  async function init(){
    try{
      if(!FBCFG?.apiKey)throw new Error('Firebase config не задан.');
      const [appM,authM,fsM]=await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${sdk}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${sdk}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${sdk}/firebase-firestore.js`)
      ]);
      const app=appM.initializeApp(FBCFG);
      const auth=authM.getAuth(app);await authM.setPersistence(auth,authM.browserLocalPersistence);
      const db=fsM.getFirestore(app);
      api={appM,authM,fsM,app,auth,db};
      await new Promise(resolve=>{const off=authM.onAuthStateChanged(auth,async user=>{off();cache.user=user;try{if(user)await hydrateProfile(user);}catch(e){cache.firebaseError=e;}resolve();});});
      if(cache.user&&cache.profile){
        await migrateLegacyCredentials();
        if(apiGatewayBase())await gatewaySession().catch(e=>notify(e.message,'error'));
        // Replay durable work from the preceding page/reload, never on each canvas edit.
        await flushPendingWork();
      }
    }catch(e){cache.firebaseError=e;console.error('Firebase init failed',e);}
    readyResolve();
  }
  init();
  async function ready(){await readyPromise;return !cache.firebaseError;}
  function assertFirebase(){if(cache.firebaseError)throw cache.firebaseError;if(!api)throw new Error('Firebase ещё не готов.');}
  async function hydrateProfile(user){
    assertFirebase();const {doc,getDoc,setDoc}=api.fsM;const ref=doc(api.db,'users',user.uid),snap=await getDoc(ref);
    if(snap.exists()){if(!['user','superuser'].includes(snap.data().role))throw new Error('В профиле должна быть роль user или superuser.');cache.profile={...snap.data(),uid:user.uid};cache.localPhotoURL=null;try{const avatar=await MagicLocal.get(user.uid,'profile-avatar');if(avatar?.file)cache.localPhotoURL=URL.createObjectURL(avatar.file);}catch{}return;}
    throw new Error('Аккаунт не добавлен в команду. Суперадмин должен создать профиль в users с твоим UID.');
  }
  async function requireUser(){await ready();if(cache.user&&cache.profile)return true;if(cache.firebaseError){notify('Не удалось загрузить профиль: '+cache.firebaseError.message,'error');return false;}const here=(location.pathname.split('/').pop()||'index.html')+location.search;location.replace('signin.html?next='+encodeURIComponent(here));return false;}
  async function signIn(email,password){if(!api)throw new Error('Firebase не загрузился. Обнови страницу.');cache.firebaseError=null;cache.profile=null;const cred=await api.authM.signInWithEmailAndPassword(api.auth,String(email).trim(),password);cache.user=cred.user;await hydrateProfile(cred.user);await migrateLegacyCredentials();return current();}
  async function signUp(){throw new Error('Аккаунты создаёт суперадмин команды.');}
  async function logout(){if(api)await api.authM.signOut(api.auth);cache.user=cache.profile=null;location.href='signin.html';}
  async function updateProfile(patch){assertFirebase();if(!cache.user)throw new Error('Нет активной сессии.');const allowed={};for(const k of ['displayName','telegram','photoURL'])if(k in patch)allowed[k]=String(patch[k]||'').slice(0,k==='displayName'?80:500);allowed.updatedAt=now();await api.fsM.updateDoc(api.fsM.doc(api.db,'users',cache.user.uid),allowed);cache.profile={...cache.profile,...allowed};return current();}
  async function uploadProfilePhoto(file){
    if(!file?.type?.startsWith('image/'))throw new Error('Выбери PNG/JPG/WebP.');
    if(file.size>5*1024*1024)throw new Error('Фото профиля — максимум 5 МБ.');
    await MagicLocal.put(cache.user.uid,'profile-avatar',{file});
    if(cache.localPhotoURL)URL.revokeObjectURL(cache.localPhotoURL);
    cache.localPhotoURL=URL.createObjectURL(file);return cache.localPhotoURL;
  }
  async function listUsers(){assertFirebase();if(!isAdmin())return [current()];const snap=await api.fsM.getDocs(api.fsM.collection(api.db,'users'));return snap.docs.map(d=>({id:d.id,uid:d.id,...d.data(),name:d.data().displayName||d.data().email})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));}
  async function createUser({email,password,name,role='user'}) {
    assertFirebase();
    if(!isAdmin())throw new Error('Только суперадмин может создавать пользователей.');
    if(!['user','superuser'].includes(role))throw new Error('Недопустимая роль.');
    const secondary=api.appM.initializeApp(FBCFG,'invite-'+uid());
    const auth2=api.authM.getAuth(secondary);let created;
    try {
      await api.authM.setPersistence(auth2,api.authM.inMemoryPersistence);
      created=(await api.authM.createUserWithEmailAndPassword(auth2,String(email).trim().toLowerCase(),password)).user;
      await api.fsM.setDoc(api.fsM.doc(api.db,'users',created.uid),{
        email:created.email,displayName:String(name||'').trim().slice(0,80)||created.email.split('@')[0],
        telegram:'',photoURL:'',role,createdAt:now(),updatedAt:now()
      });
      return created.uid;
    }catch(error){
      // Avoid an orphan Auth account if creating its profile is denied by old rules.
      if(created)try{await api.authM.deleteUser(created);}catch{error.message+=' Аккаунт создан в Authentication, но профиль не сохранён; проверь его в Firebase.';}
      throw error;
    }finally{try{await api.authM.signOut(auth2);await api.appM.deleteApp(secondary);}catch{}}
  }
  async function updateUserRole(id,role){
    assertFirebase();if(!isAdmin())throw new Error('Только суперадмин может менять роли.');
    if(!['user','superuser'].includes(role))throw new Error('Недопустимая роль.');
    if(id===cache.user.uid&&role!=='superuser')throw new Error('Свою роль суперадмина понизить нельзя.');
    await api.fsM.updateDoc(api.fsM.doc(api.db,'users',id),{role,updatedAt:now()});
  }

  let templatesPromise;
  function ensureTemplates(){return templatesPromise ||= loadTemplates().catch(e=>{templatesPromise=null;throw e;});}

  async function loadTemplates(){
    assertFirebase();if(!cache.user)return;
    const {collection,getDocs,query,where}=api.fsM;
    const loadCollection=async name=>{
      const col=collection(api.db,name);
      if(isAdmin())return (await getDocs(col)).docs;
      const [common,mine]=await Promise.all([
        getDocs(query(col,where('scope','==','common'))),
        getDocs(query(col,where('ownerUid','==',cache.user.uid)))
      ]);
      const byId=new Map();for(const d of [...common.docs,...mine.docs])byId.set(d.id,d);return [...byId.values()];
    };
    const [f,p]=await Promise.all([loadCollection('templateFolders'),loadCollection('templates')]);
    cache.folders=f.map(d=>({id:d.id,...d.data()}));cache.presets=p.map(d=>({id:d.id,...d.data()}));
    const defaults=['Character','Scene','Item','Style','Sound Effect','Others'];
    for(const name of defaults){const id='builtin-'+name.toLowerCase().replace(/\s+/g,'-');if(!cache.folders.some(x=>x.id===id))cache.folders.push({id,name,scope:'common',ownerUid:null,builtin:true});}
  }
  const listFolders=()=>cache.folders.slice();const listPresets=()=>cache.presets.slice();
  const canEdit=item=>isAdmin()||item.scope!=='common'&&item.ownerUid===cache.user?.uid;
  async function saveFolder(data){assertFirebase();const scope=data.scope==='common'?'common':'mine';if(scope==='common'&&!isAdmin())throw new Error('Общие папки создаёт администратор.');const name=String(data.name||'').trim().slice(0,60);if(!name)throw new Error('Укажи название папки.');const id=data.id&&!String(data.id).startsWith('builtin-')?data.id:uid();const row={name,scope,ownerUid:scope==='common'?cache.user.uid:cache.user.uid,updatedAt:now(),createdAt:data.createdAt||now()};await api.fsM.setDoc(api.fsM.doc(api.db,'templateFolders',id),row,{merge:true});await loadTemplates();return {id,...row};}
  async function deleteFolder(id){const f=cache.folders.find(x=>x.id===id);if(!f||f.builtin)throw new Error('Системную папку удалить нельзя.');if(!canEdit(f))throw new Error('Нет доступа.');if(cache.presets.some(p=>p.folder===id))throw new Error('Сначала удали или перемести шаблоны из папки.');await api.fsM.deleteDoc(api.fsM.doc(api.db,'templateFolders',id));await loadTemplates();}
  async function savePreset(data){assertFirebase();const scope=data.scope==='common'?'common':'mine';if(scope==='common'&&!isAdmin())throw new Error('Общие шаблоны создаёт администратор.');const name=String(data.name||'').trim().slice(0,80),text=String(data.text||'').trim();if(!name||!text)throw new Error('Заполни название и текст.');const id=data.id||uid(),old=cache.presets.find(x=>x.id===id);if(old&&!canEdit(old))throw new Error('Нет доступа к этому шаблону.');const folder=data.folder||cache.folders[0]?.id||'builtin-others';const row={name,text,folder,scope,ownerUid:old?.ownerUid||cache.user.uid,createdAt:old?.createdAt||now(),updatedAt:now()};await api.fsM.setDoc(api.fsM.doc(api.db,'templates',id),row,{merge:true});await loadTemplates();return {id,...row};}
  async function deletePreset(id){const p=cache.presets.find(x=>x.id===id);if(!p||!canEdit(p))throw new Error('Нет доступа.');await api.fsM.deleteDoc(api.fsM.doc(api.db,'templates',id));await loadTemplates();}

  const credentialKey=field=>`magic.credentials.${cache.user?.uid||'signed-out'}.${field}`;
  async function migrateLegacyCredentials(){
    const key=localStorage.getItem('magic.byteplus.apiKey'),gateway=localStorage.getItem('magic.apiGatewayUrl');
    if(!key&&!gateway)return;
    // Old credentials had no UID. Adopt them only when this user's metadata matches.
    try{
      const snap=await api.fsM.getDoc(api.fsM.doc(api.db,'integrations',`${cache.user.uid}_byteplus`));
      if(!snap.exists())return;
      const row=snap.data(),hint=row.credentialHint||'';
      const matches=(key&&hint===key.slice(0,10)+'…')||(gateway&&hint===gateway.replace(/^https?:\/\//,'').slice(0,40));
      if(row.ownerUid!==cache.user.uid||!matches)return;
      if(key&&!localStorage.getItem(credentialKey('apiKey')))localStorage.setItem(credentialKey('apiKey'),key);
      if(gateway&&!localStorage.getItem(credentialKey('gateway')))localStorage.setItem(credentialKey('gateway'),gateway);
      for(const k of ['magic.byteplus.apiKey','magic.apiGatewayUrl','magic.byteplus.mode'])localStorage.removeItem(k);
    }catch{ /* Existing credentials stay untouched until their owner can be verified. */ }
  }
  async function loadIntegrations(){
    if(!cache.user)return;cache.integrations.clear();
    try{
      const snap=await api.fsM.getDocs(api.fsM.query(api.fsM.collection(api.db,'integrations'),api.fsM.where('ownerUid','==',cache.user.uid)));
      snap.forEach(d=>cache.integrations.set(d.data().provider,{id:d.id,...d.data()}));
    }catch(err){console.warn('Integration metadata unavailable; local credentials still work.',err);}
    const localKey=String(localStorage.getItem(credentialKey('apiKey'))||'').trim();
    if(localKey&&!cache.integrations.has('byteplus'))cache.integrations.set('byteplus',{id:`${cache.user.uid}_byteplus`,ownerUid:cache.user.uid,provider:'byteplus',label:'BytePlus ModelArk',connected:true,credentialHint:localKey.slice(0,10)+'…',localOnly:true});
  }
  async function getIntegration(provider){await ready();if(!cache.integrations.size&&cache.user)await loadIntegrations();return cache.integrations.get(provider)||null;}
  async function saveIntegration(provider,data){
    assertFirebase();if(provider!=='byteplus')throw new Error('Этот provider пока не подключён.');
    const apiKey=String(data.apiKey||'').trim();
    const workerUrl=String(data.workerUrl||'').trim().replace(/\/$/,'');
    if(!apiKey&&!workerUrl)throw new Error('Вставь ARK API Key для Direct mode или Cloudflare Worker URL.');
    if(apiKey)localStorage.setItem(credentialKey('apiKey'),apiKey);else if(workerUrl)localStorage.removeItem(credentialKey('apiKey'));
    if(workerUrl)localStorage.setItem(credentialKey('gateway'),workerUrl);else localStorage.removeItem(credentialKey('gateway'));localStorage.removeItem(credentialKey('session'));
    
    const id=`${cache.user.uid}_${provider}`,old=cache.integrations.get(provider)||{};
    const hint=workerUrl?workerUrl.replace(/^https?:\/\//,'').slice(0,40):(apiKey.slice(0,10)+'…');
    const row={ownerUid:cache.user.uid,provider,label:String(data.label||'BytePlus ModelArk'),connected:true,connectionMode:workerUrl?'worker':'direct',credentialHint:hint,updatedAt:now(),createdAt:old.createdAt||now()};
    try{await api.fsM.setDoc(api.fsM.doc(api.db,'integrations',id),row);}catch(err){console.warn('Could not save integration metadata to Firestore; using local-only mode.',err);row.localOnly=true;}
    cache.integrations.set(provider,{id,...row});if(workerUrl)await gatewaySession();return {id,...row};
  }
  async function removeIntegration(provider){
    if(provider==='byteplus'){
      localStorage.removeItem(credentialKey('apiKey'));
      localStorage.removeItem(credentialKey('gateway'));localStorage.removeItem(credentialKey('session'));
      
    }
    const item=cache.integrations.get(provider);if(item){try{await api.fsM.deleteDoc(api.fsM.doc(api.db,'integrations',item.id));}catch(err){console.warn('Integration metadata delete skipped',err);}}
    cache.integrations.delete(provider);
  }
  function apiGatewayBase(){return String(localStorage.getItem(credentialKey('gateway'))||CFG.apiGatewayUrl||'').replace(/\/$/,'');}
  function byteplusBase(){return String(CFG.byteplusBaseUrl||'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/,'');}
  function byteplusMode(){return apiGatewayBase()?'worker':'direct';}
  async function providerCredentials(provider){
    if(provider==='byteplus'){
      const workerUrl=apiGatewayBase();
      if(workerUrl)return {workerUrl,connected:true,mode:'worker'};
      const apiKey=String(localStorage.getItem(credentialKey('apiKey'))||'').trim();
      return apiKey?{apiKey,connected:true,mode:'direct'}:null;
    }
    return null;
  }
  async function providerKey(provider){return (await providerCredentials(provider))?.apiKey||'';}

  function buildBytePlusRequest(payload={}){
    const content=[{type:'text',text:String(payload.prompt||'')}];
    if(payload.first_frame_url)content.push({type:'image_url',image_url:{url:payload.first_frame_url},role:'first_frame'});
    if(payload.last_frame_url)content.push({type:'image_url',image_url:{url:payload.last_frame_url},role:'last_frame'});
    for(const url of payload.reference_images||[])content.push({type:'image_url',image_url:{url},role:'reference_image'});
    for(const url of payload.reference_videos||[])content.push({type:'video_url',video_url:{url},role:'reference_video'});
    const body={model:payload.model||CFG.defaultVideoModel||'dreamina-seedance-2-5-260628',content,generate_audio:payload.generate_audio!==false,watermark:false,output_format:payload.output_format||'mp4'};
    if(payload.ratio)body.ratio=payload.ratio;
    if(payload.resolution)body.resolution=payload.resolution;
    if(payload.duration!==undefined&&payload.duration!==null&&payload.duration!=='')body.duration=Number(payload.duration);
    if(Number.isFinite(Number(payload.seed))&&Number(payload.seed)>=0)body.seed=Number(payload.seed);
    return body;
  }

  async function responseOrError(r,label='API'){
    const type=r.headers.get('content-type')||'';let data;
    try{data=type.includes('json')?await r.json():await r.text();}catch{data='';}
    if(!r.ok){const detail=typeof data==='string'?data:(data?.error?.message||data?.error||data?.message||JSON.stringify(data));const err=new Error(`${label} ${r.status}${detail?`: ${String(detail).slice(0,500)}`:''}`);err.httpStatus=r.status;throw err;}
    return data;
  }

  async function directBytePlus(path,{body}={}){
    const credentials=await providerCredentials('byteplus');
    const apiKey=credentials?.apiKey||String(localStorage.getItem(credentialKey('apiKey'))||'').trim();
    if(!apiKey)throw new Error('Вставь ARK API Key в My settings.');
    const headers={'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'};let r;
    try{
      if(path==='/byteplus/test')r=await fetch(byteplusBase()+'/contents/generations/tasks?page_num=1&page_size=1',{method:'GET',headers});
      else if(path==='/byteplus/submit')r=await fetch(byteplusBase()+'/contents/generations/tasks',{method:'POST',headers,body:JSON.stringify(buildBytePlusRequest(body?.payload||body||{}))});
      else if(path==='/byteplus/status')r=await fetch(byteplusBase()+'/contents/generations/tasks/'+encodeURIComponent(body?.taskId||''),{method:'GET',headers});
      else throw new Error('Неизвестный BytePlus route.');
    }catch(e){
      if(e instanceof TypeError)throw new Error('Браузер не смог вызвать BytePlus напрямую. Обычно это CORS. Для GitHub Pages используй Cloudflare Worker URL в My settings.');
      throw e;
    }
    const data=await responseOrError(r,'BytePlus');
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  }

  async function proxy(path,{method='GET',body,headers={}}={}){
    if(!cache.user)throw new Error('Нужна авторизация.');
    const base=apiGatewayBase();
    if(!base&&path.startsWith('/byteplus/'))return directBytePlus(path,{method,body,headers});
    if(!base)throw new Error('Cloudflare Worker URL не настроен.');
    const h={...await gatewayHeaders(),...headers};if(body!==undefined){h['Content-Type']='application/json';body=JSON.stringify(body);}let r;
    try{r=await fetch(base+path,{method,headers:h,body});}
    catch(e){throw new Error('Не удалось связаться с Cloudflare Worker. Проверь Worker URL и deploy.');}
    if(!r.ok){const type=r.headers.get('content-type')||'';let detail;try{const data=type.includes('json')?await r.json():await r.text();detail=typeof data==='string'?data:(data?.detail?.message||data?.detail||data?.error||JSON.stringify(data));}catch{detail='';}const err=new Error(`Worker ${r.status}${detail?`: ${String(detail).slice(0,500)}`:''}`);err.httpStatus=r.status;throw err;}
    return r;
  }
  async function testIntegration(provider){
    const credentials=await providerCredentials(provider);if(!credentials)throw new Error('Сначала настрой Direct ARK API Key или Cloudflare Worker URL.');
    if(provider==='byteplus'){localStorage.removeItem(credentialKey('session'));const r=await proxy('/byteplus/test',{method:'POST',body:{}});return r.json();}
    throw new Error('Тест для этого провайдера пока не реализован.');
  }

  const ownerCache=new Map(),syncingSpaces=new Map(),syncingVideos=new Map();
  const sessionKey=id=>`magic.canvas.cache.v1.${cache.user.uid}.${id}`;
  const pendingKey=id=>`magic.space.pending.${cache.user.uid}.${id}`;
  const jobsPrefix=()=>`magic.job.v3.${cache.user.uid}.`;
  function localVideos(){const rows={},prefix=jobsPrefix();for(const key of Object.keys(localStorage))if(key.startsWith(prefix)){const row=read(key,null);if(row?.uid===cache.user.uid)rows[row.id]=row;}return rows;}
  function rememberVideo(row){write(jobsPrefix()+row.id,row);return row;}
  function own(row){if(!row||row.ownerUid!==cache.user.uid)throw new Error('Этот Space доступен только его владельцу.');return row;}
  async function ownedSpace(id){return ownerCache.get(id)||own(await getSpace(id));}
  async function listSpaces(){
    assertFirebase();const {collection,getDocs,query,where}=api.fsM;
    const snap=await getDocs(query(collection(api.db,'spaces'),where('ownerUid','==',cache.user.uid)));
    return snap.docs.map(d=>{const s={...d.data(),id:d.id};ownerCache.set(s.id,s);return s;}).sort((a,b)=>timestamp(b.updatedAt)-timestamp(a.updatedAt));
  }
  async function createSpace(name='Untitled space'){
    assertFirebase();const ref=api.fsM.doc(api.fsM.collection(api.db,'spaces'));
    const row={ownerUid:cache.user.uid,name:String(name||'').trim().slice(0,80)||'Untitled space',nodeCount:0,edgeCount:0,canvasState:null,createdAt:now(),updatedAt:now()};
    await api.fsM.setDoc(ref,row);const result={id:ref.id,...row};ownerCache.set(result.id,result);return result;
  }
  async function getSpace(id){
    assertFirebase();const snap=await api.fsM.getDoc(api.fsM.doc(api.db,'spaces',id));
    if(!snap.exists())return null;const row=own({...snap.data(),id:snap.id});ownerCache.set(id,row);return row;
  }
  async function renameSpace(id,name){await ownedSpace(id);name=String(name||'').trim().slice(0,80);if(!name)throw new Error('Укажи название.');await api.fsM.updateDoc(api.fsM.doc(api.db,'spaces',id),{name,updatedAt:now()});ownerCache.get(id).name=name;}
  async function duplicateSpace(id){
    const source=await ownedSpace(id),local=read(sessionKey(id),null);
    const copy=await createSpace((source.name||'Space')+' copy');
    const state=local&&local.savedAt>(source.canvasState?.savedAt||0)?local:source.canvasState;
    if(state)await saveSpaceState(copy.id,state);return copy;
  }
  async function deleteSpace(id){
    await ownedSpace(id);await api.fsM.deleteDoc(api.fsM.doc(api.db,'spaces',id));
    ownerCache.delete(id);localStorage.removeItem(sessionKey(id));localStorage.removeItem(pendingKey(id));
  }
  function cleanSpacePayload(payload){
    const {version,savedAt,session,state,counters,edgeSequence,camera,mapVisible,assets=[]}=payload;
    // Undo history never travels to Firestore. Do not persist browser-only Blob URLs.
    return JSON.parse(JSON.stringify({version,savedAt,session,state,counters,edgeSequence,camera,mapVisible,
      assets:assets.map(a=>({...a,url:a.url?.startsWith('blob:')?null:a.url,uploading:false}))}));
  }
  function queueSpaceState(id,payload){
    write(sessionKey(id),payload);write(pendingKey(id),{savedAt:payload.savedAt});
  }
  async function storeLocalAsset(file,spaceId,assetId=uid()){
    if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))throw new Error('Поддерживаются изображения и видео.');
    if(file.size>250*1024*1024)throw new Error('Файл больше 250 МБ.');
    const meta={id:assetId,uid:cache.user.uid,spaceId,name:file.name,kind:file.type.startsWith('video/')?'video':'image',mediaType:file.type,size:file.size,createdAt:now(),updatedAt:now(),url:null,storagePath:null};
    await MagicLocal.put(cache.user.uid,assetId,{file,meta,cloudSaved:false});return {...meta,url:URL.createObjectURL(file),local:true};
  }
  async function hydrateLocalAssets(items){
    return Promise.all(items.map(async item=>{
      try{const stored=await MagicLocal.get(cache.user.uid,item.id);if(stored){const meta={...item,...stored.meta};return {...meta,url:meta.url||(stored.file?URL.createObjectURL(stored.file):null),local:!meta.storagePath};}}
      catch(e){console.warn('Local media unavailable',e.name);}
      return {...item,url:item.url?.startsWith('blob:')?null:item.url};
    }));
  }
  function fileDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
  async function storeReferenceUrl(url,spaceId,assetId=uid()){
    const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error('Нужна публичная HTTPS-ссылка на медиа.');
    const name=decodeURIComponent(parsed.pathname.split('/').pop())||'Reference';
    const kind=/\.(mp4|mov|webm|m4v|avi)$/i.test(parsed.pathname)?'video':'image';
    const meta={id:assetId,uid:cache.user.uid,spaceId,name,kind,size:0,url:parsed.href,storagePath:null,createdAt:now(),updatedAt:now()};
    await MagicLocal.put(cache.user.uid,assetId,{meta,cloudSaved:false});return meta;
  }
  async function ensureRemoteAsset(item){
    // Only the API request carries image bytes. The graph and Firestore keep metadata.
    if(/^https:\/\//.test(item.url||''))return {...item,referenceUrl:item.url};
    const stored=await MagicLocal.get(cache.user.uid,item.id);
    if(!stored?.file)throw new Error(`Добавь файл «${item.name}» повторно: локальная копия недоступна.`);
    if(item.kind==='video')throw new Error('Видеореференс требует публичную HTTPS-ссылку. Добавь его кнопкой «По ссылке»; локальное видео остаётся на этом компьютере.');
    if(!/^image\/(jpeg|png|webp|bmp|tiff|gif|heic|heif)$/.test(stored.file.type))throw new Error('Для API выбери JPG, PNG, WebP, BMP, TIFF, GIF, HEIC или HEIF.');
    if(stored.file.size>=30*1024*1024)throw new Error('Изображение для API должно быть меньше 30 МБ.');
    return {...item,referenceUrl:await fileDataUrl(stored.file)};
  }
  async function uploadAsset(file,spaceId,assetId=uid()) {return ensureRemoteAsset(await storeLocalAsset(file,spaceId,assetId));}
  async function saveSpaceState(id,payload){
    queueSpaceState(id,payload);return flushSpaceState(id);
  }
  async function flushSpaceState(id){
    if(syncingSpaces.has(id))return syncingSpaces.get(id);
    const task=(async()=>{
      const marker=read(pendingKey(id),null),local=read(sessionKey(id),null);if(!marker||!local)return;
      const payload=cleanSpacePayload(local),cloudAssets=[],used=new Set(payload.state.nodes.flatMap(n=>n.assets||[]));
      payload.assets=await Promise.all(payload.assets.filter(a=>used.has(a.id)).map(async a=>{
        const stored=await MagicLocal.get(cache.user.uid,a.id).catch(()=>null);
        if(stored?.meta&&!stored.cloudSaved)cloudAssets.push(stored);
        return {...a,url:/^https:\/\//.test(a.url||'')?a.url:null,uploading:false};
      }));
      if(new Blob([JSON.stringify(payload)]).size>850000)throw new Error('Схема больше лимита Firestore. Уменьши число нод или объём промптов; локальная копия сохранена.');
      // Each asset is registered once; one graph write at this explicit checkpoint.
      const batch=api.fsM.writeBatch(api.db);
      for(const stored of cloudAssets){const {id,...row}=stored.meta;batch.set(api.fsM.doc(api.db,'assets',id),row,{merge:true});}
      batch.update(api.fsM.doc(api.db,'spaces',id),{canvasState:payload,nodeCount:payload.state.nodes.length,edgeCount:payload.state.edges.length,updatedAt:now()});
      await batch.commit();
      for(const stored of cloudAssets)await MagicLocal.put(cache.user.uid,stored.id,{...stored,cloudSaved:true});
      if(read(pendingKey(id),null)?.savedAt===marker.savedAt)localStorage.removeItem(pendingKey(id));
      return payload;
    })();syncingSpaces.set(id,task);
    try{return await task;}finally{syncingSpaces.delete(id);}
  }
  async function listInputAssets(){
    const snap=await api.fsM.getDocs(api.fsM.query(api.fsM.collection(api.db,'assets'),api.fsM.where('uid','==',cache.user.uid)));
    return hydrateLocalAssets(snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)));
  }
  async function createVideoRecord(data){
    assertFirebase();const me=current();
    const row={id:uid(),uid:me.uid,user:me.name,spaceId:data.spaceId||null,spaceName:data.spaceName||'',sourceNodeId:data.sourceNodeId||null,outputNodeId:data.outputNodeId||null,
      prompt:data.prompt||'',provider:data.provider||'byteplus',model:data.model||CFG.defaultVideoModel||'dreamina-seedance-2-5-260628',resolution:normalizeResolution(data.resolution),ratio:normalizeRatio(data.ratio),
      seconds:Math.max(4,Math.min(30,Number(data.seconds)||8)),referenceCount:Math.max(0,Math.min(15,Number(data.referenceCount)||0)),hasRef:Boolean(data.hasRef),refMode:'reference',generateAudio:data.generateAudio!==false,
      status:'queued',pct:0,cost:null,error:null,requestId:null,videoUrl:null,remoteUrl:null,storagePath:null,createdAt:now(),updatedAt:now(),cloudSaved:false};
    return rememberVideo(row);
  }
  async function getVideo(id){
    const local=localVideos()[id];if(local)return local;
    const snap=await api.fsM.getDoc(api.fsM.doc(api.db,'videos',id));
    return snap.exists()?{...snap.data(),id:snap.id,cloudSaved:true}:null;
  }
  async function updateVideo(id,patch){
    const old=await getVideo(id);if(!old||old.uid!==cache.user.uid)throw new Error('Нет доступа к этой генерации.');
    const row=rememberVideo({...old,...patch,updatedAt:now(),cloudSaved:false});
    if(MagicDomain.terminal(row.status)){
      try{return await persistVideo(row);}catch(e){notify('Результат сохранён локально; отправка в базу ожидает повторения: '+e.message,'error');}
    }
    return row;
  }
  async function persistVideo(row){
    if(!MagicDomain.terminal(row.status)||row.cloudSaved)return row;
    if(syncingVideos.has(row.id))return syncingVideos.get(row.id);
    const task=(async()=>{
      const videoRef=api.fsM.doc(api.db,'videos',row.id),scoreRef=api.fsM.doc(api.db,'leaderboard',row.uid);
      const {id,cloudSaved,trackingWarning,...data}=row;
      data.schemaVersion=2;data.referenceCount=Math.max(0,Math.min(15,Number(data.referenceCount)||0));data.seconds=Math.max(4,Math.min(30,Number(data.seconds)||8));data.resolution=normalizeResolution(data.resolution);
      await api.fsM.runTransaction(api.db,async tx=>{
        const [previous,score]=await Promise.all([tx.get(videoRef),tx.get(scoreRef)]);
        // The same terminal task can be observed by several tabs. Count it only once.
        if(previous.exists()&&MagicDomain.terminal(previous.data().status))return;
        const before=score.exists()?score.data():{};
        tx.set(videoRef,data);
        tx.set(scoreRef,{uid:row.uid,nickname:current().name,xp:(before.xp||0)+(row.status==='completed'?MagicDomain.xp(data):0),
          completed:(before.completed||0)+(row.status==='completed'?1:0),failed:(before.failed||0)+(row.status==='failed'?1:0),lastVideoId:row.id,updatedAt:now()});
      });
      return rememberVideo({...row,cloudSaved:true});
    })();syncingVideos.set(row.id,task);
    try{return await task;}finally{syncingVideos.delete(row.id);}
  }
  async function listVideos(){
    const col=api.fsM.collection(api.db,'videos');
    const snap=await api.fsM.getDocs(isAdmin()?col:api.fsM.query(col,api.fsM.where('uid','==',cache.user.uid)));
    const byId=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id,cloudSaved:true}]));
    for(const row of Object.values(localVideos()))if(row.uid===cache.user.uid&&!row.cloudSaved)byId.set(row.id,row);
    return [...byId.values()].sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt));
  }
  function pendingVideos(spaceId){return Object.values(localVideos()).filter(v=>v.uid===cache.user.uid&&(!spaceId||v.spaceId===spaceId)&&!MagicDomain.terminal(v.status));}
  async function deleteVideo(id){
    // Keep the generation in the accounting history; only hide its card.
    const row=await getVideo(id);if(!row||row.uid!==cache.user.uid)throw new Error('Скрыть можно только свою генерацию.');
    if(!MagicDomain.terminal(row.status))throw new Error('Дождись завершения задачи.');
    await api.fsM.updateDoc(api.fsM.doc(api.db,'videos',id),{archived:true});
    const local=localVideos()[id];if(local)rememberVideo({...local,archived:true});
  }
  async function listLeaderboard(){const snap=await api.fsM.getDocs(api.fsM.collection(api.db,'leaderboard'));return snap.docs.map(d=>({...d.data(),uid:d.id}));}
  async function rebuildLeaderboard(){
    if(!isAdmin())throw new Error('Только суперадмин может пересчитать рейтинг.');
    const users=await listUsers();
    for(const user of users){
      const ref=api.fsM.doc(api.db,'leaderboard',user.uid);
      await api.fsM.runTransaction(api.db,async tx=>{
        // Read the summary BEFORE the query. A concurrent result changes this document
        // and makes the transaction retry with a fresh query, preventing lost points.
        await tx.get(ref);
        const snap=await api.fsM.getDocs(api.fsM.query(api.fsM.collection(api.db,'videos'),api.fsM.where('uid','==',user.uid)));
        const stats=MagicDomain.totals(snap.docs.map(d=>d.data()));
        tx.set(ref,{uid:user.uid,nickname:user.name||user.displayName||'User',xp:stats.xp,completed:stats.completed,failed:stats.failed,lastVideoId:'rebuild',updatedAt:now()});
      });
    }
  }
  async function flushPendingWork(){
    const tasks=[];
    for(const row of Object.values(localVideos()))if(MagicDomain.terminal(row.status)&&!row.cloudSaved)tasks.push(persistVideo(row));
    const prefix=`magic.space.pending.${cache.user.uid}.`;
    for(const key of Object.keys(localStorage))if(key.startsWith(prefix))tasks.push(flushSpaceState(key.slice(prefix.length)));
    const work=Promise.allSettled(tasks).then(results=>{for(const r of results)if(r.status==='rejected')notify('Локальные изменения ждут синхронизации: '+r.reason.message,'error');});
    // A missing network must not leave the sign-in/canvas screen blocked forever.
    await Promise.race([work,new Promise(resolve=>setTimeout(resolve,6000))]);
  }
  function normalizeResolution(v){return ['480p','720p','1080p'].includes(v)?v:'720p';}
  function normalizeRatio(v){return ['adaptive','21:9','16:9','4:3','1:1','3:4','9:16'].includes(v)?v:'16:9';}
  function extractMediaUrl(value){
    if(!value)return null;if(typeof value==='string'){if(/^https?:\/\//.test(value))return value;try{return extractMediaUrl(JSON.parse(value));}catch{return null;}}
    if(Array.isArray(value)){for(const x of value){const u=extractMediaUrl(x);if(u)return u;}return null;}
    const preferred=['video_url','videoUrl','url','output_url','output'];for(const k of preferred)if(k in value){const u=extractMediaUrl(value[k]);if(u)return u;}
    for(const k of ['video','videos','content','data','result','results','outputs'])if(k in value){const u=extractMediaUrl(value[k]);if(u)return u;}return null;
  }
  function statusName(raw){const s=String(raw||'').toUpperCase();if(['COMPLETED','SUCCEEDED','SUCCESS'].includes(s))return'completed';if(['FAILED','ERROR','CANCELLED','CANCELED'].includes(s))return'failed';if(['QUEUED','PENDING'].includes(s))return'queued';return'running';}
  async function submitGeneration(videoId,payload,provider='byteplus'){
    const credentials=await providerCredentials(provider);if(!credentials)throw new Error('Подключи BytePlus в My settings → Integrations.');
    if(provider!=='byteplus')throw new Error('Провайдер пока не подключён к генератору.');
    const body={payload:{...payload,prompt:String(payload.prompt||''),duration:Math.max(4,Math.min(30,Number(payload.duration)||8)),resolution:normalizeResolution(payload.resolution),ratio:normalizeRatio(payload.aspect_ratio||payload.ratio),generate_audio:payload.generate_audio!==false,output_format:'mp4'}};
    if(new Blob([JSON.stringify(body)]).size>60*1024*1024)throw new Error('Референсы превышают размер запроса API. Уменьши изображения или используй HTTPS-ссылки.');
    const response=await proxy('/byteplus/submit',{method:'POST',body});const data=await response.json();
    const requestId=data.id||data.request_id;
    if(!requestId)throw new Error('API не вернул ID задачи. Проверь историю BytePlus перед повторным запуском.');
    return updateVideo(videoId,{requestId,taskToken:data.taskToken||null,status:'queued',pct:0});
  }
  async function persistRemoteVideo(record,result){
    const remote=extractMediaUrl(result)||record.remoteUrl;
    if(!remote)throw new Error('API завершил задачу, но URL видео пока не найден.');
    const videoUrl=remote,storagePath=null,archiveWarning=null;
    const providerTime=Number(result?.updated_at||result?.finished_at);
    const providerUrlExpiresAt=(providerTime>0?(providerTime<1e12?providerTime*1000:providerTime):now())+24*60*60*1000;
    const metrics=result?.metrics||result?.usage||result?.data?.metrics||{},rawCost=result?.cost??metrics.cost??record.cost;
    const actualDuration=Number(result?.duration??result?.content?.duration??metrics.duration);
    const patch={status:'completed',pct:100,remoteUrl:remote,videoUrl,storagePath,providerUrlExpiresAt,
      cost:rawCost!=null&&Number.isFinite(Number(rawCost))?Number(rawCost):null,finishedAt:now(),error:null,archiveWarning};
    if(actualDuration>=4&&actualDuration<=30)patch.seconds=actualDuration;
    if(['480p','720p','1080p'].includes(result?.resolution))patch.resolution=result.resolution;
    return updateVideo(record.id,patch);
  }
  async function refreshGeneration(record){
    record=record?.id?record:await getVideo(record);
    if(!record||record.uid!==cache.user.uid)throw new Error('Продолжить можно только свою генерацию.');
    if(MagicDomain.terminal(record.status)||!record.requestId)return record;
    if(!await providerCredentials(record.provider||'byteplus'))throw new Error('Настрой BytePlus для продолжения задачи.');
    const response=await proxy('/byteplus/status',{method:'POST',body:{taskId:record.requestId,taskToken:record.taskToken||null}});
    const data=await response.json(),status=statusName(data.status||data.state);
    if(status==='failed'){
      const error=data.error?.message||data.error||data.message||'API сообщил об ошибке генерации';
      return updateVideo(record.id,{status:'failed',error:typeof error==='string'?error:JSON.stringify(error),finishedAt:now()});
    }
    if(status==='completed')return persistRemoteVideo(record,data);
    return updateVideo(record.id,{status,pct:Number(data.progress??data.pct??record.pct)||0,trackingWarning:null});
  }
  function pause(ms,signal){return new Promise(resolve=>{
    if(signal?.aborted){resolve();return;}
    const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
    const timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});
  });}
  async function watchGeneration(record,onUpdate,{interval=4500,signal}={}){
    let item=record,errors=0;
    while(!signal?.aborted&&!MagicDomain.terminal(item.status)){
      await pause(Math.min(30000,interval*2**errors),signal);if(signal?.aborted)break;
      try{item=await refreshGeneration(item);errors=0;onUpdate?.(item);}
      catch(error){
        errors++;onUpdate?.({...item,trackingWarning:error.message});
        // A disconnected browser is not a failed remote generation. Keep its task ID.
        if(errors>=5||[401,403].includes(error.httpStatus))throw error;
      }
    }
    return item;
  }
  let sessionRequest;
  async function gatewaySession(){
    const gateway=apiGatewayBase();if(!gateway)return null;
    const stored=read(credentialKey('session'),null);
    if(stored?.gateway===gateway&&stored.expiresAt>Date.now()+60000)return stored.token;
    if(sessionRequest)return sessionRequest;
    sessionRequest=(async()=>{
      const response=await fetch(gateway+'/byteplus/session',{method:'POST',headers:{Authorization:'Bearer '+await api.auth.currentUser.getIdToken()},signal:AbortSignal.timeout(8000)});
      // Compatibility with the already-deployed, older Worker. Replace its code before
      // inviting the team; the new Worker always requires the membership receipt.
      if(response.status===404){write(credentialKey('session'),{gateway,token:null,expiresAt:Date.now()+300000});return null;}
      const data=await responseOrError(response,'Worker');
      write(credentialKey('session'),{gateway,token:data.sessionToken,expiresAt:data.expiresAt});return data.sessionToken;
    })();
    try{return await sessionRequest;}finally{sessionRequest=null;}
  }
  async function gatewayHeaders(taskToken){
    const headers={Authorization:'Bearer '+await api.auth.currentUser.getIdToken()};
    const session=await gatewaySession();if(session)headers['X-Magic-Session']=session;
    if(taskToken)headers['X-Task-Token']=taskToken;return headers;
  }

  function getTheme(){return localStorage.getItem('magic.theme')||localStorage.getItem('picasso.theme')||'dark';}
  function applyTheme(theme=getTheme()){theme=theme==='light'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('magic.theme',theme);return theme;}
  function toggleTheme(){return applyTheme(getTheme()==='dark'?'light':'dark');}
  applyTheme();

  async function mountProfileDrawer(){const drawer=document.querySelector('#profile-drawer');if(!drawer)return;const u=current();if(!u)return;const avatar=document.querySelectorAll('[data-user-avatar]');avatar.forEach(x=>{if(x.tagName==='IMG'){x.src=u.photoURL||'';}else x.textContent=u.name.slice(0,2).toUpperCase();});drawer.querySelector('[data-profile-email]').textContent=u.email||'';drawer.querySelector('[name=displayName]').value=u.name||'';drawer.querySelector('[name=telegram]').value=u.telegram||'';const img=drawer.querySelector('.profile-photo-img'),letters=drawer.querySelector('.profile-photo-letters');if(u.photoURL){img.src=u.photoURL;img.hidden=false;letters.hidden=true;}else{img.hidden=true;letters.hidden=false;letters.textContent=u.name.slice(0,2).toUpperCase();}
    const form=drawer.querySelector('#profile-form');if(form&&!form.dataset.bound){form.dataset.bound='1';form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{await updateProfile({displayName:form.displayName.value,telegram:form.telegram.value});notify('Профиль сохранён');await mountProfileDrawer();}catch(err){notify(err.message,'error');}finally{b.disabled=false;}};}
    const photo=drawer.querySelector('#profile-photo-input');if(photo&&!photo.dataset.bound){photo.dataset.bound='1';photo.onchange=async()=>{try{if(photo.files[0]){await uploadProfilePhoto(photo.files[0]);notify('Фото сохранено в этом браузере');await mountProfileDrawer();}}catch(e){notify(e.message,'error');}photo.value='';};}
    const admin=drawer.querySelector('#drawer-admin');if(admin){admin.hidden=!isAdmin();if(isAdmin()&&!admin.dataset.bound){admin.dataset.bound='1';admin.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;try{await createUser({email:f.email.value,password:f.password.value,name:f.elements.namedItem('name').value,role:f.elements.namedItem('role').value});f.reset();notify('Пользователь создан');}catch(err){notify(err.message,'error');}finally{b.disabled=false;}};}}
  }

  function profileMenu(root){if(!root)return;root.replaceChildren();const u=current();if(!u)return;root.append(el('strong',u.name),el('small',u.email));}
  function recordUsage(){/* compatibility: real generation records live in Firestore /videos */}
  function interruptRuns(){/* remote jobs survive navigation; task IDs are kept locally */}

  function bindShell(){
    document.querySelectorAll('[data-superuser-only]').forEach(node=>node.hidden=!isAdmin());
    const person=current();document.querySelectorAll('[data-user-email]').forEach(node=>node.textContent=person?.email||'');document.querySelectorAll('[data-user-name]').forEach(node=>node.textContent=person?.name||'');
    const avatar=document.querySelector('#shell-avatar'),drawer=document.querySelector('#profile-drawer'),backdrop=document.querySelector('#drawer-backdrop');const close=()=>{drawer?.classList.remove('open');backdrop?.classList.remove('show');};avatar?.addEventListener('click',async()=>{await mountProfileDrawer();drawer?.classList.add('open');backdrop?.classList.add('show');});document.querySelector('#profile-close')?.addEventListener('click',close);document.querySelector('#profile-cancel')?.addEventListener('click',close);backdrop?.addEventListener('click',close);document.querySelector('[data-logout]')?.addEventListener('click',logout);
    document.querySelectorAll('[data-theme-state]').forEach(x=>x.textContent=getTheme()==='dark'?'Dark':'Light');
    document.querySelectorAll('[data-theme-toggle]').forEach(b=>b.onclick=()=>{const t=toggleTheme();document.querySelectorAll('[data-theme-state]').forEach(x=>x.textContent=t==='dark'?'Dark':'Light');});
    document.querySelectorAll('[data-coming]').forEach(a=>a.onclick=e=>{e.preventDefault();notify('Раздел уже заложен в структуру, функциональность добавим следующим этапом.');});
  }

  return {ready,requireUser,current,isAdmin,signIn,signUp,logout,updateProfile,uploadProfilePhoto,listUsers,createUser,updateUserRole,uid,read,write,notify,download,element:el,timestamp,
    listFolders,listPresets,canEdit,saveFolder,deleteFolder,savePreset,deletePreset,loadTemplates,ensureTemplates,
    getIntegration,saveIntegration,removeIntegration,testIntegration,providerKey,providerCredentials,apiGatewayBase,
    listSpaces,createSpace,getSpace,renameSpace,duplicateSpace,deleteSpace,saveSpaceState,queueSpaceState,flushSpaceState,flushPendingWork,
    uploadAsset,storeLocalAsset,storeReferenceUrl,hydrateLocalAssets,ensureRemoteAsset,listInputAssets,createVideoRecord,updateVideo,getVideo,listVideos,deleteVideo,submitGeneration,refreshGeneration,watchGeneration,extractMediaUrl,pendingVideos,listLeaderboard,rebuildLeaderboard,
    getTheme,applyTheme,toggleTheme,mountProfileDrawer,bindShell,proxy,profileMenu,recordUsage,interruptRuns};
})();
