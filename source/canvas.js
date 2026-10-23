'use strict';
(async() => {
  await Studio.ready();
  if(!await Studio.requireUser())return;
  Studio.bindShell(); await Studio.mountProfileDrawer();
  const pageUrl=new URL(location.href), SPACE_ID=pageUrl.searchParams.get('space');
  if(!SPACE_ID){location.replace('spaces.html');return;}
  const SPACE=await Studio.getSpace(SPACE_ID);
  if(!SPACE){Studio.notify('Space не найден или нет доступа.','error');location.replace('spaces.html');return;}
  const $=(s,r=document)=>r.querySelector(s), svgNS='http://www.w3.org/2000/svg';
  const viewport=$('#viewport'),world=$('#world'),nodeLayer=$('#node-layer'),edgeLayer=$('#edge-layer'),draftPath=$('#draft-wire');
  const nodes=new Map(),edges=new Map(),assets=new Map(),selected=new Set(),jobs=new Map(),submittingSources=new Map();
  const types={media:{prefix:'M',title:'Media',icon:'▧',color:'blue'},text:{prefix:'T',title:'Text generation',icon:'T',color:'text-icon'},generation:{prefix:'G',title:'Video generation',icon:'✦',color:'purple'},preset:{prefix:'P',title:'Preset',icon:'▱',color:'preset-icon'},output:{prefix:'O',title:'Output',icon:'▷',color:'green'}};
  const counters={media:0,text:0,generation:0,output:0,preset:0},camera={x:0,y:0,zoom:1};
  const SESSION_KEY='magic.canvas.cache.v1.'+Studio.current().id+'.'+SPACE_ID;
  let session={id:Math.random().toString(36).slice(2,8).toUpperCase(),started:new Date().toISOString()},journal=[],undoStack=[],redoStack=[];
  let selectedEdge=null,edgeSequence=0,highestZ=2,frame=0,tool='select',space=false,gesture=null,draft=null,panel=null,activeEdit=null,mapDrag=null,mapGeometry=null,mapVisible=innerWidth>700,storageWarned=false;
  const resizeObserver=new ResizeObserver(schedule),inputTarget=el=>!!el.closest('input,textarea,select,[contenteditable="true"]');
  const clone=v=>JSON.parse(JSON.stringify(v));
  let noticeTimer,portMenuContext=null,composerNode=null,pendingUploadLink=null,pendingPresetTarget=null;
  let presetLibrary=null,checkpointTimer=null,lastSavedAt=0;
  if($('#space-name'))$('#space-name').textContent=SPACE.name||'Untitled';
  if($('#space-breadcrumb'))$('#space-breadcrumb').textContent=SPACE.name||'Untitled';
  if($('#avatar-button'))$('#avatar-button').textContent=Studio.current().name.slice(0,2).toUpperCase();
  function notify(message){clearTimeout(noticeTimer);$('#notice').textContent=message;$('#notice').hidden=false;noticeTimer=setTimeout(()=>$('#notice').hidden=true,4000);}
  function snapshot(){return {nodes:[...nodes.values()].map(n=>({id:n.id,type:n.type,x:n.x,y:n.y,fields:{...n.fields},assets:[...n.assets],...(n.type==='output'&&n.videoRecord?{videoRecord:{...n.videoRecord}}:{})})),edges:[...edges.values()].map(e=>({...e}))};}
  function sessionPayload(){return {version:6,savedAt:(lastSavedAt=Math.max(Date.now(),lastSavedAt+1)),session,state:snapshot(),journal:journal.slice(-150),undoStack:undoStack.slice(-25),redoStack:redoStack.slice(-25),counters:{...counters},edgeSequence,camera:{...camera},mapVisible,assets:[...assets.values()].map(({id,name,kind,size,url,storagePath,mediaType,portraitGroupId})=>({id,name,kind,size,url:url||null,storagePath:storagePath||null,mediaType:mediaType||null,portraitGroupId:portraitGroupId||null,uploading:false}))};}
  function saveSession(){
    try{Studio.queueSpaceState(SPACE_ID,sessionPayload());if($('#autosave-state'))$('#autosave-state').textContent='Сохранено на компьютере';}
    catch(e){if($('#autosave-state'))$('#autosave-state').textContent='Не сохранено';if(!storageWarned){storageWarned=true;notify('Локальное хранилище заполнено. Освободи место перед закрытием страницы.');}}
  }
  function checkpoint(){
    clearTimeout(checkpointTimer);checkpointTimer=setTimeout(async()=>{
      finishEdit();saveSession();$('#autosave-state').textContent='Синхронизация…';
      try{await Studio.flushSpaceState(SPACE_ID);$('#autosave-state').textContent='Синхронизировано';}
      catch(e){$('#autosave-state').textContent='Сохранено локально · повтор при входе';notify(e.message);}
    },180);
  }
  function log(label,detail=''){journal.push({id:Date.now()+'-'+Math.random().toString(16).slice(2),time:new Date().toISOString(),label,detail});if(panel==='history')renderPanel();}
  function commit(before,label,detail=''){const after=snapshot();if(JSON.stringify(before)===JSON.stringify(after))return;undoStack.push({before,after,label});redoStack=[];log(label,detail);updateStatus();saveSession();}
  function mutate(label,fn,detail=''){finishEdit();const before=snapshot();const result=fn();commit(before,label,detail);return result;}
  function restore(state){cancelDraft();selected.clear();selectedEdge=null;for(const n of nodes.values()){resizeObserver.unobserve(n.el);n.previewSource?.release();}nodes.clear();edges.clear();nodeLayer.replaceChildren();for(const data of state.nodes)buildNode(data);for(const e of state.edges)edges.set(e.id,{...e});refreshContent();updateStatus();schedule();if(panel==='settings')renderPanel();}
  function undo(){finishEdit();const entry=undoStack.pop();if(!entry)return;redoStack.push(entry);restore(entry.before);log('Отменено: '+entry.label);updateStatus();saveSession();}
  function redo(){finishEdit();const entry=redoStack.pop();if(!entry)return;undoStack.push(entry);restore(entry.after);log('Повторено: '+entry.label);updateStatus();saveSession();}
  function finishEdit(){if(!activeEdit)return;const edit=activeEdit;activeEdit=null;commit(edit.before,edit.field==='name'?`Переименована нода ${edit.id}`:`Изменены настройки ${edit.id}`,edit.field==='text'?'Текст для передачи':edit.field==='prompt'?'Промпт':edit.field==='instruction'?'Инструкция':edit.field==='name'?'Название':edit.field);}
  function updateStatus(){
    $('#empty-state').hidden=nodes.size>0;$('#node-count').textContent=nodes.size?`${nodes.size} нод · ${edges.size} связей`:'Пустое поле';
    $('#selection-status').textContent=`${nodes.size} нод · ${edges.size} связей${selected.size?` · выбрано ${selected.size}`:selectedEdge?' · выбрана связь':''}`;
    $('#delete-selection').disabled=!selected.size&&!selectedEdge;$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;$('#map-count').textContent=String(nodes.size);
    $('#session-label').textContent=`Сессия ${session.id}`;for(const n of nodes.values())n.el.classList.toggle('selected',selected.has(n.id));for(const g of edgeLayer.children)g.classList.toggle('selected',g.dataset.edge===selectedEdge);drawMinimap();renderComposer();paintSelection();
  }
  function selectionBounds(items=[...selected].map(id=>nodes.get(id)).filter(Boolean)){
    if(!items.length)return null;
    const x=Math.min(...items.map(n=>n.x)),y=Math.min(...items.map(n=>n.y)),right=Math.max(...items.map(n=>n.x+n.el.offsetWidth)),bottom=Math.max(...items.map(n=>n.y+n.el.offsetHeight));
    return {x,y,right,bottom,width:right-x,height:bottom-y};
  }
  function magneticMove(items,dx,dy,zoom,others,disabled=false){
    const moving=items.map(n=>({...n,x:n.x+dx,y:n.y+dy}));
    if(disabled||!moving.length||!others.length)return {dx,dy,guides:[]};
    const bounds=rs=>{const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y)),right=Math.max(...rs.map(r=>r.x+r.width)),bottom=Math.max(...rs.map(r=>r.y+r.height));return {x,y,width:right-x,height:bottom-y};};
    const sources=moving.length>1?[bounds(moving),...moving]:moving,limit=6/zoom,axes={};
    for(const axis of ['x','y']){
      const size=axis==='x'?'width':'height';let best=null;
      for(const source of sources)for(const target of others)for(const a of [0,.5,1])for(const b of [0,.5,1]){
        const line=target[axis]+target[size]*b,delta=line-source[axis]-source[size]*a,rank=(a===b?0:1)+(a===.5&&b===.5?-1:0);
        if(Math.abs(delta)<=limit&&(!best||Math.abs(delta)<Math.abs(best.delta)-.0001||Math.abs(Math.abs(delta)-Math.abs(best.delta))<.0001&&rank<best.rank))best={delta,line,rank};
      }if(best)axes[axis]=best;
    }
    const sx=axes.x?.delta||0,sy=axes.y?.delta||0,group=bounds(moving.map(r=>({...r,x:r.x+sx,y:r.y+sy}))),guides=[];
    for(const axis of ['x','y'])if(axes[axis]){
      const size=axis==='x'?'width':'height',cross=axis==='x'?'y':'x',crossSize=axis==='x'?'height':'width',line=axes[axis].line;
      const matches=others.filter(r=>[0,.5,1].some(a=>Math.abs(r[axis]+r[size]*a-line)<.01));
      guides.push({axis,line,start:Math.min(group[cross],...matches.map(r=>r[cross]))-12/zoom,end:Math.max(group[cross]+group[crossSize],...matches.map(r=>r[cross]+r[crossSize]))+12/zoom});
    }
    return {dx:dx+sx,dy:dy+sy,guides};
  }
  function showSnapGuides(guides=[]){
    const host=$('#snap-guides');host.replaceChildren();
    for(const g of guides){const line=document.createElement('div');line.className='snap-guide';Object.assign(line.style,g.axis==='x'?{left:g.line+'px',top:g.start+'px',width:1/camera.zoom+'px',height:(g.end-g.start)+'px'}:{left:g.start+'px',top:g.line+'px',width:(g.end-g.start)+'px',height:1/camera.zoom+'px'});host.append(line);}
  }
  function paintSelection(){
    const box=$('#selection-bounds'),bar=$('#selection-actions'),b=selectionBounds();if(!box||!bar)return;
    box.hidden=!b||selected.size<2;bar.hidden=!b||selected.size<2;
    if(!b)return;Object.assign(box.style,{left:(b.x-8)+'px',top:(b.y-8)+'px',width:(b.width+16)+'px',height:(b.height+16)+'px'});
    const r=viewport.getBoundingClientRect();bar.style.left=Math.max(r.left+12,Math.min(r.right-bar.offsetWidth-12,r.left+camera.x+b.x*camera.zoom))+'px';bar.style.top=Math.max(r.top+12,Math.min(r.bottom-60,r.top+camera.y+b.y*camera.zoom-46))+'px';
  }
  function alignSelection(mode){
    const b=selectionBounds();if(!b||selected.size<2)return;
    finishEdit();mutate('Выровнены ноды',()=>{for(const id of selected){const n=nodes.get(id),w=n.el.offsetWidth,h=n.el.offsetHeight;moveNode(n,mode==='left'?b.x:mode==='right'?b.right-w:mode==='center-x'?(b.x+b.right-w)/2:n.x,mode==='top'?b.y:mode==='bottom'?b.bottom-h:mode==='center-y'?(b.y+b.bottom-h)/2:n.y);}schedule();});
  }
  $('#selection-actions').addEventListener('pointerdown',e=>e.stopPropagation());
  $('#selection-actions').addEventListener('click',e=>{const action=e.target.closest('[data-align]');if(action)alignSelection(action.dataset.align);});
  $('#focus-selection').addEventListener('click',()=>fitView(true));
  function clearSelection(){selected.clear();selectedEdge=null;updateStatus();if(panel==='settings')renderPanel();}
  function selectNode(id,additive=false){selectedEdge=null;if(additive){selected.has(id)?selected.delete(id):selected.add(id);}else if(!selected.has(id)){selected.clear();selected.add(id);}updateStatus();if(panel==='settings')renderPanel();}
  function selectEdge(id){if(!edges.has(id))return;finishEdit();selected.clear();selectedEdge=id;updateStatus();openPanel('settings');}
  function worldPoint(x,y){const r=viewport.getBoundingClientRect();return {x:(x-r.left-camera.x)/camera.zoom,y:(y-r.top-camera.y)/camera.zoom};}
  function center(){const r=viewport.getBoundingClientRect();return worldPoint(r.left+r.width/2-(panel?140:50),r.top+r.height/2-35);}
  function setCamera(){world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;const gridStep=18*camera.zoom*Math.pow(2,Math.max(0,Math.ceil(Math.log2(12/(18*camera.zoom)))));viewport.style.backgroundSize=`${gridStep}px ${gridStep}px`;viewport.style.backgroundPosition=`${camera.x}px ${camera.y}px`;$('#zoom-reset').textContent=`${Math.round(camera.zoom*100)}%`;drawMinimap();positionComposer();paintSelection();}
  function zoomAt(value,x,y){const p=worldPoint(x,y),r=viewport.getBoundingClientRect();camera.zoom=Math.max(.15,Math.min(3,value));camera.x=x-r.left-p.x*camera.zoom;camera.y=y-r.top-p.y*camera.zoom;setCamera();saveSession();}
  function zoomCenter(value){const r=viewport.getBoundingClientRect();zoomAt(value,r.left+r.width/2,r.top+r.height/2);}
  function setTool(value){tool=value;viewport.classList.toggle('pan-mode',tool==='pan');for(const t of ['select','pan']){$(`#${t}-tool`).classList.toggle('active',t===tool);$(`#${t}-tool`).setAttribute('aria-pressed',String(t===tool));}}
  function moveNode(n,x,y){n.x=x;n.y=y;n.el.style.left=x+'px';n.el.style.top=y+'px';}
  function defaultFields(type){return type==='generation'?{prompt:'',model:MagicDomain.normalizeBytePlusModel(null,window.MAGIC_APP_CONFIG?.defaultVideoModel),ratio:'16:9',duration:'8',resolution:'720p',referenceMode:'reference',taskMode:'auto',generateAudio:'true',batch:'1'}:type==='preset'?{text:'',enabled:'true'}:type==='text'?{instruction:'',text:'',model:'none'}:{};}
  function mediaBody(id){return `<div class="media-assets"></div><label class="dropzone"><span class="upload-symbol">+</span><strong>Добавить медиа</strong><small>Перетащи файл или нажми здесь</small><input data-upload type="file" accept="image/*,video/*" multiple hidden aria-label="Добавить медиа в ${id}"></label><button class="secondary-button" data-add-url>По ссылке</button>`;}
  function textBody(id){return `<div class="text-node-body"><textarea id="text-${id}" data-field="text" rows="6" aria-label="Текст для передачи" placeholder="Введи текст…"></textarea></div>`;}
  function generationBody(id){return `<div class="prompt-node-body"><textarea data-field="prompt" rows="5" aria-label="Промпт ${id}" placeholder="Опиши видео…
Можно использовать @image1 и @video1"></textarea><span class="prompt-node-hint">✦ Seedance · нажми для настройки</span></div>`;}
  function presetBody(){return '<div class="preset-node-body"><h3 class="preset-heading"></h3><div class="camera-node-preview" hidden><video controls muted loop playsinline preload="metadata" controlslist="nodownload nofullscreen"></video><small class="camera-node-error" hidden>Пример недоступен. Промпт камеры сохранён.</small><small>Пример движения камеры</small></div><p class="preset-excerpt" tabindex="0" role="button" aria-label="Редактировать пресет"></p></div>';}

  function outputBody(){return `<div class="output-preview"><video class="output-video" controls controlslist="nofullscreen" playsinline preload="metadata" hidden></video><button class="output-expand" aria-label="Предпросмотр видео" title="Предпросмотр" hidden>↗</button><span class="play-mark">▷</span><div class="loading-view" hidden><div class="loading-percent">0%</div><div class="loading-track" role="progressbar" aria-label="Generation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="loading-marker"></span></div><span class="loading-label">Seedance 2.5 · generating</span></div><div class="output-message"><output>Ожидание</output><small class="output-status">Подключи Video generation</small></div><button class="cancel-generation" hidden>Остановить отслеживание</button><button class="resume-generation" hidden>Продолжить отслеживание</button></div><button class="output-download" hidden>Скачать видео</button><button class="higgsfield-fallback ui-button" hidden>Лицо отклонено · Перейти на Higgsfield</button>`;}
  function nodeName(n){return n.fields.name?.trim()||`${n.type==='generation'?'Video':n.type==='text'?'Text':types[n.type].title} ${n.id}`;}
  function renameNode(n){const title=$('.node-title',n.el),input=$('.node-name-input',n.el);if(!input.hidden)return;input.dataset.original=n.fields.name;title.hidden=true;input.hidden=false;input.focus();input.select();}
  function endRename(n,cancel=false){const input=$('.node-name-input',n.el);if(cancel){n.fields.name=input.dataset.original||'';input.value=n.fields.name;}else if(!n.fields.name?.trim()){n.fields.name=nodeName(n);input.value=n.fields.name;}syncFields(n);finishEdit();input.hidden=true;$('.node-title',n.el).hidden=false;schedule();}
  function reconcileJobs(){for(const [id,job] of jobs){const out=nodes.get(id);if(!out||!nodes.get(job.source)){job.controller?.abort();jobs.delete(id);}}}
  function applyVideoRecord(out,r){out.videoRecord={...out.videoRecord,...r};out.fields.provider=r.provider||out.fields.provider;out.fields.ratio=r.ratio||out.fields.ratio;out.fields.trackingPaused=false;out.fields.generationId=r.id||out.fields.generationId;out.fields.status=r.status||out.fields.status;out.fields.requestId=r.requestId||out.fields.requestId;out.fields.videoUrl=r.videoUrl||out.fields.videoUrl;out.fields.remoteUrl=r.remoteUrl||out.fields.remoteUrl;out.fields.providerUrlExpiresAt=r.providerUrlExpiresAt||out.fields.providerUrlExpiresAt;out.fields.cost=r.cost??out.fields.cost;out.fields.error=r.error||null;out.fields.progress=Number(r.pct??out.fields.progress)||0;}
  async function outputRecord(n){return n.videoRecord?.uid?n.videoRecord:n.fields.generationId?await Studio.getVideo(n.fields.generationId):{id:n.id,uid:Studio.current().uid,videoUrl:n.fields.videoUrl,ratio:n.fields.ratio};}
  async function showOutput(n){try{MagicVideoViewer.show(await outputRecord(n),{mode:'output'});}catch(e){notify(e.message);}}
  function paintOutput(n){
    const fallback=$('.higgsfield-fallback',n.el);if(fallback)fallback.hidden=!(n.fields.status==='failed'&&(n.fields.provider||'byteplus')==='byteplus'&&MagicProviders.isFaceRejection(n.fields.error));
    const download=$('.output-download',n.el);download.hidden=!n.fields.videoUrl;
    $('.output-expand',n.el).hidden=!n.fields.videoUrl;
    if(n.fields.videoUrl){download.textContent=n.fields.providerUrlExpiresAt&&Date.now()>=n.fields.providerUrlExpiresAt?'Ссылка могла истечь':'Скачать видео';download.title='Сохрани видео на компьютер.';}
    const job=jobs.get(n.id),status=n.fields.status||'',src=incoming(n.id)[0],phase=submittingSources.get(src?.id),sending=status==='submitting'&&phase==='sending',loading=sending||!!job&&['queued','running','processing'].includes(status||'running'),video=$('.output-video',n.el);
    n.el.classList.toggle('is-loading',loading);n.el.setAttribute('aria-busy',String(loading));$('.loading-view',n.el).hidden=!loading;$('.output-message',n.el).hidden=loading||!!n.fields.videoUrl;$('.play-mark',n.el).hidden=loading||!!n.fields.videoUrl;
    $('.cancel-generation',n.el).hidden=!job||!loading;$('.resume-generation',n.el).hidden=!n.fields.trackingPaused||!n.fields.requestId;
    video.hidden=!n.fields.videoUrl;if(!n.fields.videoUrl&&video.hasAttribute('src')){video.pause();video.removeAttribute('src');n.previewSource?.release();n.previewSource=null;n.previewKey=null;}
    if(n.fields.videoUrl){
      if(n.fields.provider!=='openrouter'){if(video.src!==n.fields.videoUrl)video.src=n.fields.videoUrl;}
      else{const key=n.fields.generationId+'|'+n.fields.videoUrl;if(n.previewKey!==key){n.previewKey=key;n.previewSource?.release();n.previewSource=null;outputRecord(n).then(r=>Studio.resolveVideoSource(r)).then(source=>{if(nodes.get(n.id)!==n||n.previewKey!==key){source.release();return;}n.previewSource=source;video.src=source.url;}).catch(e=>{if(nodes.get(n.id)===n){video.title=e.message;notify(e.message);}});}}
    }
    if(loading){
      const pct=Number(job?.progress??n.fields.progress)||0;$('.loading-percent',n.el).textContent=sending?'…':(pct?Math.round(pct)+'%':'…');
      $('.loading-label',n.el).textContent=sending?'Отправка · ожидание ID задачи':status==='queued'?MagicProviders.providerName(n.fields.provider)+' · в очереди':'Seedance 2.5 · generating';
      const track=$('.loading-track',n.el);track.setAttribute('aria-valuenow',String(pct));track.style.setProperty('--progress',(pct||3)+'%');
    }else if(!n.fields.videoUrl){
      $('output',n.el).textContent=phase==='preparing'?'Подготовка референсов…':n.fields.trackingPaused?'Отслеживание приостановлено':['submission_unknown','submitting'].includes(status)?'Запуск не подтверждён':status==='failed'?'FAILED':status==='cancelled'?'Cancelled':status==='completed'?'Completed':status==='queued'?'В очереди':src?'Ready to generate':'No source';
      $('.output-status',n.el).textContent=phase==='preparing'?'Чтение локальных файлов; задача ещё не отправлена.':n.fields.trackingWarning||n.fields.error||(n.fields.trackingPaused?'Удалённая задача продолжает работать.':null)||(status==='completed'?'Result archived in Assets':src?`Source ${nodeName(src)}`:'Connect Video generation');
    }
    $('.node-state',n.el).textContent=n.fields.videoUrl?'Ready':status|| (src?`Source ${src.id}`:'Waiting');
  }
  const selectedVideoProvider=n=>n?.fields.apiProvider||Studio.activeVideoProvider()||'byteplus';
  function updateGenerateButtons(){const provider=selectedVideoProvider(nodes.get(composerNode)),tag=$('#composer-provider');if(tag)tag.textContent=provider?MagicProviders.providerName(provider):'API отключён';const label=id=>submittingSources.get(id)==='preparing'?'Подготовка…':submittingSources.has(id)?'Отправка…':'Generating…';const c=$('#composer-generate');if(c){const loading=submittingSources.has(composerNode)||[...jobs.values()].some(j=>j.source===composerNode);c.disabled=loading||!provider;c.textContent=loading?label(composerNode):!provider?'Подключить API':'✦ Generate';}for(const n of nodes.values()){const button=$('[data-generate]',n.el);if(!button)continue;const running=submittingSources.has(n.id)||[...jobs.values()].some(j=>j.source===n.id);button.disabled=running||!selectedVideoProvider(n);button.textContent=running?label(n.id):n.type==='text'?'✦ Generate text':'✦ Generate';}}
  async function trackOutput(output,source,record){
    if(jobs.has(output.id))return;
    const controller=new AbortController(),job={source:source.id,videoId:record.id,progress:Number(record.pct)||0,controller};
    jobs.set(output.id,job);applyVideoRecord(output,record);paintOutput(output);updateGenerateButtons();saveSession();
    try{
      const final=await Studio.watchGeneration(record,r=>{job.progress=Number(r.pct)||0;applyVideoRecord(output,r);output.fields.trackingWarning=r.trackingWarning||null;paintOutput(output);saveSession();},{signal:controller.signal});
      if(!controller.signal.aborted){applyVideoRecord(output,final);jobs.delete(output.id);paintOutput(output);updateGenerateButtons();log(final.status==='completed'?'Видео готово':'Генерация завершена',`${output.id} · ${final.status}`);saveSession();checkpoint();}
    }catch(error){jobs.delete(output.id);output.fields.trackingPaused=true;output.fields.trackingWarning=error.message;paintOutput(output);updateGenerateButtons();saveSession();notify('Отслеживание приостановлено: '+error.message);}
  }
  async function resumeOutput(output){
    if(!output.fields.generationId||jobs.has(output.id))return;
    try{
      const record=await Studio.getVideo(output.fields.generationId);if(!record)return;
      applyVideoRecord(output,record);paintOutput(output);
      if(!MagicDomain.terminal(record.status)&&record.requestId){const source=incoming(output.id)[0];if(source)trackOutput(output,source,record);}
      else if(!MagicDomain.terminal(record.status)&&!record.requestId){output.fields.trackingPaused=true;output.fields.trackingWarning='Нет ID задачи. Проверь историю BytePlus перед новым запуском.';paintOutput(output);}
    }catch(error){output.fields.trackingPaused=true;output.fields.trackingWarning=error.message;paintOutput(output);}
  }
  function cancelGeneration(id){const job=jobs.get(id);if(!job)return;job.controller.abort();jobs.delete(id);const out=nodes.get(id);if(out){out.fields.trackingPaused=true;paintOutput(out);}updateGenerateButtons();saveSession();notify('Отслеживание остановлено. Задача в BytePlus продолжает работать.');}
  const hfDialogs=new Set();
  async function requestHiggsfield(source,failedOutput=null){
    if(!source||source.type!=='generation'||hfDialogs.has(source.id)||submittingSources.has(source.id)||[...jobs.values()].some(j=>j.source===source.id))return;
    const saved=failedOutput?.fields.fallbackSpec,spec=saved?structuredClone(saved):{prompt:failedOutput?.videoRecord?.prompt||compiledPrompt(source).trim(),options:{duration:Number(source.fields.duration)||8,resolution:source.fields.resolution,aspect_ratio:source.fields.ratio,generate_audio:source.fields.generateAudio!=='false'},assetIds:referenceIds(source)};
    spec.assetIds=spec.assetIds.filter(id=>referenceIds(source).includes(id));
    if(spec.assetIds.some(id=>!assets.has(id))){notify('Исходный референс недоступен. Добавь его повторно.');return;}
    if(!spec.prompt){notify('Добавь промпт.');return;}
    const count=failedOutput?1:([1,2,4].includes(Number(source.fields.batch))?Number(source.fields.batch):1);
    // A fallback uses the current visible settings; consent never hides a duration/ratio override.
    spec.options={...spec.options,model:MagicProviders.higgsfieldModel(source.fields.higgsfieldModel),duration:Number(source.fields.duration)||8,resolution:source.fields.resolution,aspect_ratio:source.fields.ratio,generate_audio:source.fields.generateAudio!=='false'};
    if(!['16:9','4:3','1:1','3:4','9:16','21:9'].includes(spec.options.aspect_ratio)){notify('Выбери формат видео в Settings перед запуском Higgsfield.');return;}
    const dialog=document.createElement('dialog');dialog.className='studio-dialog';dialog.setAttribute('aria-label','Подтверждение перехода на Higgsfield');
    dialog.innerHTML='<header><h2>Повышенная стоимость · Higgsfield</h2><button type="button" class="icon-button" data-hf-close>×</button></header><div class="stack"><p>Выбранная модель Seedance будет запущена через Higgsfield API. Стоимость может быть выше BytePlus. Higgsfield может работать с референсами с лицами, но также проверяет их по своим правилам и не гарантирует принятие каждого референса.</p><a href="https://open.higgsfield.ai/pricing" target="_blank" rel="noopener noreferrer">Тарифы Higgsfield API ↗</a><p data-hf-summary></p><p data-hf-error class="form-error" role="alert"></p><button type="button" class="ui-button" data-hf-cancel>Отмена</button><button type="button" class="ui-button primary" data-hf-submit>Подтвердить и генерировать</button></div>';
    $('[data-hf-summary]',dialog).textContent=`Higgsfield · Seedance ${spec.options.model.endsWith('2.0')?'2.0':'2.5'} · ${spec.options.resolution} · ${spec.options.duration}s · ${spec.options.aspect_ratio} · ${count}x. Референсов: ${spec.assetIds.length}. Точная сумма зависит от тарифа API. Для одного фото формат берётся из изображения.`;
    for(const b of dialog.querySelectorAll('[data-hf-close],[data-hf-cancel]'))b.onclick=()=>dialog.close();
    dialog.onclose=()=>{hfDialogs.delete(source.id);dialog.remove();};
    let sending=false;
    $('[data-hf-submit]',dialog).onclick=async()=>{
      if(sending)return;sending=true;const button=$('[data-hf-submit]',dialog),error=$('[data-hf-error]',dialog);button.disabled=true;error.textContent='';submittingSources.set(source.id,'preparing');updateGenerateButtons();
      try{
        const options={...spec.options};
        MagicProviders.buildHiggsfieldRequest({...options,prompt:spec.prompt,reference_images:[],reference_videos:[]});
        const config=await Studio.higgsfieldRequest('config');if(!config.ready)throw Error('Higgsfield не подключён: установи HF_CREDENTIALS в Secrets сервера.');
        button.textContent='Подготовка референсов…';
        const refs=[];for(const id of spec.assetIds)refs.push(await Studio.ensureRemoteAsset(assets.get(id),{provider:'higgsfield'}));
        const payload={...options,prompt:spec.prompt,reference_images:refs.filter(a=>a.kind==='image').map(a=>a.referenceUrl),reference_videos:refs.filter(a=>a.kind==='video').map(a=>a.referenceUrl),higgsfieldConfirmed:true};
        MagicProviders.buildHiggsfieldRequest(payload);
        if(!dialog.open||nodes.get(source.id)!==source)return;
        submittingSources.set(source.id,'sending');updateGenerateButtons();dialog.close();
        for(let index=0;index<count;index++){
        let output;mutate('Подтверждён платный переход на Higgsfield',()=>{const pos={x:source.x+source.el.offsetWidth+110,y:failedOutput?failedOutput.y+failedOutput.el.offsetHeight+90:source.y+310};let guard=0;while([...nodes.values()].some(n=>pos.x<n.x+n.el.offsetWidth+24&&pos.x+280>n.x&&pos.y<n.y+n.el.offsetHeight+24&&pos.y+260>n.y)&&guard++<100)pos.y+=310;output=addNode('output',pos);connectRaw(source.id,output.id);output.fields.provider='higgsfield';});
        const record=await Studio.createVideoRecord({spaceId:SPACE_ID,spaceName:SPACE.name,sourceNodeId:source.id,outputNodeId:output.id,prompt:spec.prompt,provider:'higgsfield',model:options.model,transport:'worker',gatewayUrl:Studio.higgsfieldGateway(),resolution:options.resolution,ratio:options.aspect_ratio,seconds:options.duration,referenceCount:refs.length,videoReferenceCount:payload.reference_videos.length,hasRef:refs.length>0,generateAudio:options.generate_audio});
        applyVideoRecord(output,{...record,status:'submitting'});paintOutput(output);saveSession();
        try{const submitted=await Studio.submitGeneration(record.id,payload,'higgsfield');applyVideoRecord(output,submitted);saveSession();trackOutput(output,source,submitted);}
        catch(e){const definite=e.httpStatus>=400&&e.httpStatus<500,failed=await Studio.updateVideo(record.id,{status:definite?'failed':'submission_unknown',error:e.message});applyVideoRecord(output,failed);paintOutput(output);saveSession();notify(e.message);break;}
        }
      }catch(e){if(dialog.open)error.textContent=e.message;else notify(e.message);}
      finally{sending=false;submittingSources.delete(source.id);updateGenerateButtons();button.disabled=false;button.textContent='Подтвердить и генерировать';}
    };
    hfDialogs.add(source.id);document.body.append(dialog);dialog.showModal();
  }
  async function startGeneration(source){
    if(!source||source.type!=='generation'||submittingSources.has(source.id)||[...jobs.values()].some(j=>j.source===source.id))return;
    finishEdit();if(selectedVideoProvider(source)==='higgsfield')return requestHiggsfield(source);const prompt=compiledPrompt(source).trim();if(!prompt){notify('Добавь промпт перед генерацией.');return;}
    submittingSources.set(source.id,'preparing');updateGenerateButtons();for(const out of nodes.values())if(out.type==='output')paintOutput(out);
    try{
      const provider=selectedVideoProvider(source),credentials=provider&&await Studio.providerCredentials(provider);if(!credentials)throw new Error('Подключи и включи API в My settings.');if(Studio.activeVideoProvider()!==provider)Studio.setVideoProvider(provider);
      const ids=referenceIds(source),localRefs=ids.map(id=>assets.get(id));
      if(localRefs.some(a=>!a||a.uploading||a.error))throw new Error('Дождись локального сохранения референсов или добавь недоступный файл повторно.');
      if(localRefs.length>15)throw new Error('Для одной генерации допускается до 15 референсов.');
      const refs=[];for(const a of localRefs)refs.push(await Studio.ensureRemoteAsset(a,{provider}));
      if(new Blob([JSON.stringify(refs.map(a=>a.referenceUrl))]).size>59*1024*1024)throw new Error('Референсы слишком большие для API. Уменьши изображения или добавь их по ссылке.');
      const images=refs.filter(a=>a.kind==='image').map(a=>a.referenceUrl),videos=refs.filter(a=>a.kind==='video').map(a=>a.referenceUrl);
      const options={omni_reference_task_type:source.fields.taskMode||'auto',model:Studio.videoModelFor(provider,source.fields.model),duration:Number(source.fields.duration)||8,resolution:source.fields.resolution,aspect_ratio:source.fields.ratio,generate_audio:source.fields.generateAudio!=='false'};
      await Studio.prepareVideoRequest(provider,{...options,prompt,reference_images:images,reference_videos:videos});
      if(Studio.activeVideoProvider()!==provider)throw new Error('Провайдер изменился во время подготовки. Запусти генерацию заново.');
      const count=[1,2,4].includes(Number(source.fields.batch))?Number(source.fields.batch):1,runs=[];
      submittingSources.set(source.id,'sending');updateGenerateButtons();
      const existing=[...edges.values()].filter(e=>e.from===source.id&&nodes.get(e.to)?.type==='output').map(e=>nodes.get(e.to));
      mutate('Запущена генерация',()=>{
        for(let i=0;i<count;i++){
          let output=existing[i];
          if(!output){const pos={x:source.x+source.el.offsetWidth+110,y:source.y+i*320};let guard=0;
            while([...nodes.values()].some(n=>pos.x<n.x+n.el.offsetWidth+24&&pos.x+280>n.x&&pos.y<n.y+n.el.offsetHeight+24&&pos.y+260>n.y)&&guard++<100)pos.y+=310;
            output=addNode('output',pos);connectRaw(source.id,output.id);
          }
          output.fields={name:output.fields.name,status:'submitting',progress:0,fallbackSpec:{prompt,options:{...options},assetIds:localRefs.map(a=>a.id)}};runs.push(output);
        }
        selected.clear();selected.add(source.id);refreshContent();updateStatus();
      },`${nodeName(source)} · ${count} результатов`);
      await Promise.all(runs.map(async output=>{
        const record=await Studio.createVideoRecord({spaceId:SPACE_ID,spaceName:SPACE.name,sourceNodeId:source.id,outputNodeId:output.id,prompt,provider,transport:credentials.mode,gatewayUrl:credentials.workerUrl||null,model:options.model,resolution:options.resolution,ratio:options.aspect_ratio,seconds:options.duration,referenceCount:refs.length,videoReferenceCount:videos.length,hasRef:refs.length>0,generateAudio:options.generate_audio});
        applyVideoRecord(output,{...record,status:'submitting'});paintOutput(output);saveSession();
        try{
          const submitted=await Studio.submitGeneration(record.id,{...options,prompt,reference_images:images,reference_videos:videos,asset_receipts:Object.fromEntries(refs.filter(a=>a.assetToken).map(a=>[a.referenceUrl.slice(8),a.assetToken]))},provider);
          applyVideoRecord(output,submitted);saveSession();trackOutput(output,source,submitted);
        }catch(error){
          const definite=error.httpStatus>=400&&error.httpStatus<500;
          const failed=await Studio.updateVideo(record.id,{status:definite?'failed':'submission_unknown',error:error.message,finishedAt:definite?Date.now():null});
          applyVideoRecord(output,failed);paintOutput(output);saveSession();if(definite)checkpoint();
          notify(error.message);
        }
      }));
    }catch(error){notify(error.message);}
    finally{submittingSources.delete(source.id);updateGenerateButtons();for(const out of nodes.values())if(out.type==='output')paintOutput(out);schedule();}
  }

  function buildNode(data){
    const t=types[data.type];if(!t)return;const n={...data,fields:{...defaultFields(data.type),...data.fields},assets:[...(data.assets||[])],el:document.createElement('article')};
    if(n.type==='generation'){n.fields.model=MagicDomain.normalizeBytePlusModel(n.fields.model,window.MAGIC_APP_CONFIG?.defaultVideoModel);n.fields.referenceMode='reference';if(!['auto','reference','edit','extend'].includes(n.fields.taskMode))n.fields.taskMode='auto';n.fields.duration=String(Math.max(4,Math.min(30,Number(n.fields.duration)||8)));if(!['480p','720p','1080p'].includes(n.fields.resolution))n.fields.resolution='720p';if(n.fields.ratio==='Авто')n.fields.ratio='adaptive';}n.fields.name=n.fields.name??nodeName(n);n.el.className='node';n.el.dataset.node=n.id;n.el.dataset.type=n.type;n.el.tabIndex=0;n.el.setAttribute('aria-label',`${t.title} ${n.id}`);
    n.el.innerHTML=`<header class="node-header"><span class="node-icon ${t.color}">${t.icon}</span><h2 class="node-title" title="Двойной клик — переименовать"></h2><input class="node-name-input" data-field="name" maxlength="80" aria-label="Название ноды" hidden><button class="rename-node" title="Переименовать" aria-label="Переименовать ноду">✎</button><span class="node-id">${n.id}</span></header>${['generation','text','output'].includes(n.type)?`<button class="port in" data-direction="in" data-node="${n.id}" aria-label="Вход ${n.id}" title="Вход ${n.id}"></button>`:''}${n.type!=='output'?`<button class="port out" data-direction="out" data-node="${n.id}" aria-label="Выход ${n.id}" title="Выход ${n.id}"></button>`:''}<div class="node-body">${n.type==='media'?mediaBody(n.id):n.type==='text'?textBody(n.id):n.type==='generation'?generationBody(n.id):n.type==='preset'?presetBody(n.id):outputBody()}</div><footer class="node-footer"><span class="node-state"></span><code>${n.type==='media'?'media out':n.type==='text'?'text out':n.type==='generation'?'inputs / result':'media in'}</code></footer>`;
    if(n.fields.kind==='camera'){
      n.el.dataset.camera='true';$('.node-icon',n.el).textContent='◎';$('footer code',n.el).textContent='camera prompt';
      const clip=MagicCameraMovements.get(n.fields.cameraId),preview=$('.camera-node-preview',n.el);
      if(clip&&preview){const video=$('video',preview);preview.hidden=false;video.src=clip.url;video.setAttribute('aria-label','Camera movement · '+clip.name);video.onerror=()=>{$('.camera-node-error',preview).hidden=false;};}
    }nodes.set(n.id,n);nodeLayer.append(n.el);moveNode(n,n.x,n.y);resizeObserver.observe(n.el);syncFields(n);
    n.el.querySelector('[data-add-url]')?.addEventListener('click',()=>addUrlReference(n));
    n.el.addEventListener('change',e=>{if(e.target.matches('[data-upload]')){const files=Array.from(e.target.files);mutate(`Добавлены медиа в ${n.id}`,()=>addFiles(n,files),files.map(f=>f.name).join(', '));e.target.value='';if(panel==='settings')renderPanel();}});
    $('.node-title',n.el).addEventListener('dblclick',()=>renameNode(n));
    $('.rename-node',n.el).addEventListener('click',()=>renameNode(n));
    const nameInput=$('.node-name-input',n.el);nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();endRename(n,e.key==='Escape');n.el.focus();}});nameInput.addEventListener('blur',()=>{if(!nameInput.hidden)endRename(n);});
    $('.save-node-preset',n.el)?.addEventListener('click',()=>saveNodePreset(n));
    $('[data-generate]',n.el)?.addEventListener('click',()=>startGeneration(n));
    $('.output-expand',n.el)?.addEventListener('click',()=>showOutput(n));$('.output-video',n.el)?.addEventListener('dblclick',()=>showOutput(n));$('.output-download',n.el)?.addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;try{await Studio.downloadVideo(await outputRecord(n));}catch(e){notify(e.message);}finally{button.disabled=false;}});
    $('.higgsfield-fallback',n.el)?.addEventListener('click',()=>requestHiggsfield(incoming(n.id)[0],n));
    $('.cancel-generation',n.el)?.addEventListener('click',()=>cancelGeneration(n.id));$('.resume-generation',n.el)?.addEventListener('click',()=>resumeOutput(n));$('.preset-excerpt',n.el)?.addEventListener('click',()=>{selectNode(n.id);openPanel('settings');});$('.preset-excerpt',n.el)?.addEventListener('keydown',e=>{if(e.key==='Enter'){selectNode(n.id);openPanel('settings');}});
    n.el.addEventListener('toggle',schedule,true);
    n.el.addEventListener('dragover',e=>{if(hasFiles(e)&&['media','generation'].includes(n.type)){e.preventDefault();e.stopPropagation();n.el.classList.add('file-over');e.dataTransfer.dropEffect='copy';}});
    n.el.addEventListener('dragleave',e=>{if(!n.el.contains(e.relatedTarget))n.el.classList.remove('file-over');});
    n.el.addEventListener('drop',e=>{if(!['media','generation'].includes(n.type))return;e.preventDefault();e.stopPropagation();n.el.classList.remove('file-over');viewport.classList.remove('file-over');const files=Array.from(e.dataTransfer.files);mutate(`Добавлены медиа в ${n.id}`,()=>addFiles(n,files),files.map(f=>f.name).join(', '));if(panel==='settings')renderPanel();});
    return n;
  }
  function syncFields(n,except=null){if(n.type==='preset'){$('.preset-heading',n.el).textContent=n.fields.heading||nodeName(n);$('.preset-excerpt',n.el).textContent=n.fields.text||'Нажми, чтобы добавить промпт пресета…';}$('.node-title',n.el).textContent=nodeName(n);n.el.setAttribute('aria-label',nodeName(n));for(const input of n.el.querySelectorAll('[data-field]'))if(input!==except)input.value=n.fields[input.dataset.field]??'';if(composerNode===n.id)for(const el of $('#generation-composer').querySelectorAll('[data-panel-field]'))if(el!==except&&el!==document.activeElement)el.value=n.fields[el.dataset.panelField]??'';}
  function addNode(type,position,fields={},files=[]){
    const cameraNode=type==='generation'&&!position?[...nodes.values()].find(n=>n.fields.kind==='camera'):null;if(cameraNode)position={x:cameraNode.x+cameraNode.el.offsetWidth+100,y:cameraNode.y};
    const id=types[type].prefix+(++counters[type]),p=position||center();const n=buildNode({id,type,x:p.x,y:p.y,fields,assets:[]});
    if(!position){n.x-=n.el.offsetWidth/2;n.y-=Math.min(n.el.offsetHeight,450)/2;let k=0;while([...nodes.values()].some(o=>o!==n&&Math.abs(o.x-n.x)<35&&Math.abs(o.y-n.y)<35)&&k++<25){n.x+=40;n.y+=35;}}
    moveNode(n,n.x,n.y);n.el.style.zIndex=String(++highestZ);selected.clear();selected.add(id);selectedEdge=null;if(files.length)addFiles(n,files);else refreshContent();updateStatus();schedule();return n;
  }
  function mediaKind(file){if(file.type.startsWith('image/'))return 'image';if(file.type.startsWith('video/'))return 'video';const ext=file.name.split('.').pop().toLowerCase();return ['png','jpg','jpeg','webp','gif','avif','bmp','svg'].includes(ext)?'image':['mp4','webm','mov','m4v','ogv'].includes(ext)?'video':null;}
  function addFiles(n,files){
    for(const file of files){if(!mediaKind(file)){notify('Поддерживаются изображения и видео.');continue;}
      const id=Studio.uid(),url=URL.createObjectURL(file);assets.set(id,{id,name:file.name,kind:mediaKind(file),size:file.size,url,uploading:true,mediaType:file.type});n.assets.push(id);
      Studio.storeLocalAsset(file,SPACE_ID,id).then(meta=>{URL.revokeObjectURL(url);assets.set(id,{...meta,uploading:false});refreshContent();saveSession();}).catch(e=>{const a=assets.get(id);if(a){a.uploading=false;a.error=e.message;}refreshContent();notify('Локальное сохранение: '+e.message);});
    }refreshContent();schedule();
  }
  async function addUrlReference(n){
    const url=window.prompt('Публичная HTTPS-ссылка на изображение или видео (.mp4, .mov, .webm):');if(!url?.trim())return;
    try{const meta=await Studio.storeReferenceUrl(url.trim(),SPACE_ID);mutate('Добавлена ссылка на медиа',()=>{assets.set(meta.id,meta);n.assets.push(meta.id);refreshContent();saveSession();});}catch(e){notify(e.message);}
  }
  function portraitButton(a){
    const b=document.createElement('button');b.className='portrait-ref-button';b.textContent=a.portraitGroupId?'Портрет ✓':'Портрет';b.title='Регистрация портрета в BytePlus';b.setAttribute('aria-label','Портрет: '+a.name);
    b.disabled=!!a.uploading;
    // Selecting a media node or blurring the prompt can replace this reference chip.
    b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};
    b.onclick=e=>{e.stopPropagation();finishEdit();MagicPortraits.manage(a,updated=>{assets.set(updated.id,updated);refreshContent();saveSession();});};return b;
  }
  function assetElement(id,owner,removable,source){
    const a=assets.get(id);if(!a)return document.createElement('span');const wrap=document.createElement('div');wrap.className='asset-preview';
    if(a.url){const media=document.createElement(a.kind==='image'?'img':'video');media.src=a.url;media.draggable=false;if(a.kind==='image')media.alt=a.name;else{media.controls=true;media.muted=true;media.preload='metadata';media.playsInline=true;}media.addEventListener('error',()=>{media.hidden=true;const error=document.createElement('div');error.className='asset-unavailable';error.textContent='Формат не поддерживается браузером';wrap.prepend(error);},{once:true});wrap.append(media);}else{const unavailable=document.createElement('div');unavailable.className='asset-unavailable';unavailable.textContent='Добавь файл повторно';wrap.append(unavailable);}
    const cap=document.createElement('div');cap.className='asset-caption';const name=document.createElement('span');name.textContent=a.name+(a.uploading?' · uploading…':'');name.title=a.name;cap.append(name);if(a.kind==='image'&&selectedVideoProvider(owner)==='byteplus')cap.append(portraitButton(a));
    if(removable){const b=document.createElement('button');b.className='asset-remove';b.textContent='×';b.setAttribute('aria-label',`Убрать ${a.name}`);b.addEventListener('click',()=>mutate(`Убрано медиа из ${owner.id}`,()=>{owner.assets=owner.assets.filter(i=>i!==id);refreshContent();schedule();},a.name));cap.append(b);}wrap.append(cap);
    if(source){const text=document.createElement('div');text.className='reference-source';text.textContent=source;wrap.append(text);}return wrap;
  }
  function incoming(id,type){return [...edges.values()].filter(e=>e.to===id&&(!type||nodes.get(e.from)?.type===type)).map(e=>nodes.get(e.from)).filter(Boolean);}
  function referenceIds(n){const excluded=new Set(n.fields.excludedAssetIds||[]);return [...new Set([...incoming(n.id,'media').flatMap(src=>src.assets),...n.assets])].filter(id=>!excluded.has(id));}
  function removeReference(n,id){n.assets=n.assets.filter(x=>x!==id);n.fields.excludedAssetIds=[...new Set([...(n.fields.excludedAssetIds||[]),id])];refreshContent();saveSession();}
  function compiledPrompt(n){const base=n.type==='text'?n.fields.instruction:n.fields.prompt;const linked=n.type==='generation'?incoming(n.id,'text').map(t=>t.fields.text).filter(Boolean):[];const presets=incoming(n.id,'preset').filter(p=>p.fields.enabled!=='false').map(p=>p.fields.text).filter(Boolean);return [base,...linked,...presets].filter(t=>t?.trim()).join('\n\n');}
  function updateLinkedText(){const n=nodes.get(composerNode);if(n){const preview=$('#compiled-prompt');if(preview)preview.textContent=compiledPrompt(n)||'Промпт пока пуст';}}
  function refreshContent(){reconcileJobs();for(const n of nodes.values()){
    if(n.type==='media'){$('.media-assets',n.el).replaceChildren(...n.assets.map(a=>assetElement(a,n,true)));$('.node-state',n.el).textContent=n.assets.length?`Файлов: ${n.assets.length}`:'Нет файлов';const label=$('.dropzone',n.el);label.style.minHeight=n.assets.length?'75px':'';$('.upload-symbol',label).hidden=!!n.assets.length;}
    if(n.type==='text'||n.type==='preset'){$('.node-state',n.el).textContent=n.type==='preset'?(n.fields.enabled==='false'?'Выключен':'Полный промпт подключён'):'Текст / промпт';syncFields(n);}
    if(n.type==='generation')$('.node-state',n.el).textContent='Seedance · Omni Reference';
    if(n.type==='output')paintOutput(n);
  }updateLinkedText();updateGenerateButtons();refreshComposerAssets();}
  function portPoint(id,direction){const n=nodes.get(id),p=n&&$(`.port.${direction}`,n.el);if(!p)return null;const r=p.getBoundingClientRect();return worldPoint(r.x+r.width/2,r.y+r.height/2);}
  function curve(a,b){const bend=Math.max(65,Math.abs(b.x-a.x)*.48);return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y},${b.x-bend} ${b.y},${b.x} ${b.y}`;}
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;renderWires();drawMinimap();positionComposer();paintSelection();});}
  function renderWires(){edgeLayer.replaceChildren();for(const e of edges.values()){const a=portPoint(e.from,'out'),b=portPoint(e.to,'in');if(!a||!b)continue;const g=document.createElementNS(svgNS,'g');g.dataset.edge=e.id;g.setAttribute('class','edge-group'+(selectedEdge===e.id?' selected':''));const p=document.createElementNS(svgNS,'path');p.setAttribute('class','edge-visible '+(nodes.get(e.from).type==='text'?'text':nodes.get(e.from).type==='generation'?'result':''));p.setAttribute('d',curve(a,b));const hit=document.createElementNS(svgNS,'path');hit.setAttribute('class','edge-hit');hit.setAttribute('d',curve(a,b));hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label',`Связь ${e.from} → ${e.to}`);hit.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();selectEdge(e.id);}});g.append(p,hit);edgeLayer.append(g);}renderDraft();}
  function renderDraft(){draftPath.toggleAttribute('hidden',!draft);if(!draft)return;const start=portPoint(draft.node,draft.direction);if(!start){cancelDraft();return;}const end=draft.point||start;draftPath.setAttribute('d',draft.direction==='out'?curve(start,end):curve(end,start));}
  function cancelDraft(){viewport.classList.remove('is-wiring');draft=null;document.querySelectorAll('.port.pending').forEach(p=>p.classList.remove('pending'));draftPath.setAttribute('hidden','');}
  function validLink(from,to,ignore=null){const a=nodes.get(from),b=nodes.get(to);if(!a||!b)return 'Выбери существующие ноды.';if(a.id===b.id)return 'Нельзя соединить ноду с собой.';if(a.fields.kind==='camera'&&b.type!=='generation')return 'Camera movement подключается к Video generation.';if(!((['media','text','preset'].includes(a.type)&&b.type==='generation')||(a.type==='preset'&&b.type==='text')||(['generation','text'].includes(a.type)&&b.type==='output')))return 'Допустимые связи: Media / Text / Preset → Video; Preset → Text; Video / Text → Output.';if([...edges.values()].some(e=>e.id!==ignore&&e.from===from&&e.to===to))return 'Эта связь уже существует.';return '';}
  function connectRaw(from,to,editingId=null){const error=validLink(from,to,editingId);if(error)return error;for(const e of edges.values())if(e.id!==editingId&&e.to===to&&(nodes.get(to).type==='output'||(nodes.get(from).type==='text'&&nodes.get(e.from).type==='text')))edges.delete(e.id);const id=editingId||'E'+(++edgeSequence);edges.set(id,{id,from,to});refreshContent();schedule();updateStatus();return '';}
  function finishLink(port){if(!draft)return;const id=port.dataset.node,dir=port.dataset.direction;if(draft.node===id&&draft.direction===dir)return;if(dir===draft.direction){notify('Соединяй выход со входом.');cancelDraft();return;}const from=dir==='in'?draft.node:id,to=dir==='in'?id:draft.node;const error=validLink(from,to);cancelDraft();if(error){notify(error);return;}mutate(`Создана связь ${from} → ${to}`,()=>connectRaw(from,to));if(panel==='settings')renderPanel();}
  function beginPort(port){if(draft){finishLink(port);return;}clearSelection();viewport.classList.add('is-wiring');draft={node:port.dataset.node,direction:port.dataset.direction,point:portPoint(port.dataset.node,port.dataset.direction)};port.classList.add('pending');renderDraft();}
  function deleteSelection(){if(!selected.size&&!selectedEdge)return;const label=selectedEdge?'Удалена связь':`Удалены ноды: ${[...selected].join(', ')}`;mutate(label,()=>{cancelDraft();if(selectedEdge){edges.delete(selectedEdge);selectedEdge=null;}else for(const id of selected){const n=nodes.get(id);if(!n)continue;resizeObserver.unobserve(n.el);n.previewSource?.release();n.el.remove();nodes.delete(id);for(const e of edges.values())if(e.from===id||e.to===id)edges.delete(e.id);}selected.clear();refreshContent();schedule();updateStatus();});if(panel==='settings')renderPanel();}
  function fitView(onlySelected=false){const items=onlySelected&&selected.size?[...selected].map(id=>nodes.get(id)):[...nodes.values()];if(!items.length){camera.x=0;camera.y=0;camera.zoom=1;setCamera();return;}let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const n of items){x=Math.min(x,n.x);y=Math.min(y,n.y);right=Math.max(right,n.x+n.el.offsetWidth);bottom=Math.max(bottom,n.y+n.el.offsetHeight);}const r=viewport.getBoundingClientRect(),leftPad=35,topPad=95,availableW=Math.max(180,r.width-(panel?440:120)),availableH=Math.max(200,r.height-250);camera.zoom=Math.max(.15,Math.min(1.25,availableW/(right-x),availableH/(bottom-y)));camera.x=leftPad+availableW/2-(x+right)/2*camera.zoom;camera.y=topPad+availableH/2-(y+bottom)/2*camera.zoom;setCamera();saveSession();}
  function drawMinimap(){if(!mapVisible)return;const r=viewport.getBoundingClientRect(),view={x:-camera.x/camera.zoom,y:-camera.y/camera.zoom,w:r.width/camera.zoom,h:r.height/camera.zoom};let minX=view.x,minY=view.y,maxX=view.x+view.w,maxY=view.y+view.h;for(const n of nodes.values()){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x+n.el.offsetWidth);maxY=Math.max(maxY,n.y+n.el.offsetHeight);}if(!mapDrag){const padding=Math.max(80,(maxX-minX)*.07);minX-=padding;minY-=padding;maxX+=padding;maxY+=padding;const scale=Math.min(240/(maxX-minX),124/(maxY-minY));mapGeometry={minX,minY,scale,ox:(260-(maxX-minX)*scale)/2,oy:(144-(maxY-minY)*scale)/2};}const g=mapGeometry;if(!g)return;const x=v=>g.ox+(v-g.minX)*g.scale,y=v=>g.oy+(v-g.minY)*g.scale;const group=$('#minimap-nodes');group.replaceChildren();for(const n of nodes.values()){const rect=document.createElementNS(svgNS,'rect');rect.setAttribute('x',x(n.x));rect.setAttribute('y',y(n.y));rect.setAttribute('width',Math.max(2,n.el.offsetWidth*g.scale));rect.setAttribute('height',Math.max(2,n.el.offsetHeight*g.scale));rect.setAttribute('rx','1');rect.setAttribute('class',`mini-node ${n.type}${selected.has(n.id)?' selected':''}`);group.append(rect);}const rect=$('#minimap-view');rect.setAttribute('x',x(view.x));rect.setAttribute('y',y(view.y));rect.setAttribute('width',view.w*g.scale);rect.setAttribute('height',view.h*g.scale);}
  function minimapPoint(e){const r=$('#minimap').getBoundingClientRect(),g=mapGeometry;return {x:((e.clientX-r.left)/r.width*260-g.ox)/g.scale+g.minX,y:((e.clientY-r.top)/r.height*144-g.oy)/g.scale+g.minY};}
  function moveCameraCenter(p){const r=viewport.getBoundingClientRect();camera.x=r.width/2-p.x*camera.zoom;camera.y=r.height/2-p.y*camera.zoom;setCamera();}
  $('#minimap').setAttribute('preserveAspectRatio','none');
  $('#minimap').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const p=minimapPoint(e),r=viewport.getBoundingClientRect(),current={x:(r.width/2-camera.x)/camera.zoom,y:(r.height/2-camera.y)/camera.zoom};mapDrag={offsetX:e.target.id==='minimap-view'?current.x-p.x:0,offsetY:e.target.id==='minimap-view'?current.y-p.y:0};moveCameraCenter({x:p.x+mapDrag.offsetX,y:p.y+mapDrag.offsetY});$('#minimap').setPointerCapture(e.pointerId);});
  $('#minimap').addEventListener('pointermove',e=>{if(mapDrag){const p=minimapPoint(e);moveCameraCenter({x:p.x+mapDrag.offsetX,y:p.y+mapDrag.offsetY});}});
  const endMap=e=>{mapDrag=null;if($('#minimap').hasPointerCapture(e.pointerId))$('#minimap').releasePointerCapture(e.pointerId);drawMinimap();saveSession();};$('#minimap').addEventListener('pointerup',endMap);$('#minimap').addEventListener('pointercancel',endMap);
  $('#minimap').addEventListener('keydown',e=>{const d={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]}[e.key];if(d){e.preventDefault();camera.x+=d[0];camera.y+=d[1];setCamera();saveSession();}});
  $('#toggle-minimap').addEventListener('click',()=>{mapVisible=!mapVisible;$('#minimap-wrap').hidden=!mapVisible;$('#toggle-minimap').setAttribute('aria-pressed',String(mapVisible));$('#toggle-minimap').title=mapVisible?'Скрыть мини-карту':'Показать мини-карту';$('#toggle-minimap').setAttribute('aria-label',$('#toggle-minimap').title);drawMinimap();saveSession();});
  async function openPanel(type){finishEdit();panel=type;menu(false);$('#profile-popover').hidden=true;$('#avatar-button').setAttribute('aria-expanded','false');$('#side-panel').hidden=!type;for(const t of ['settings','history','presets']){$(`#${t}-toggle`).classList.toggle('active',type===t);$(`#${t}-toggle`).setAttribute('aria-expanded',String(type===t));}if(type==='presets'){try{await Studio.ensureTemplates();}catch(e){notify(e.message);}}if(type)renderPanel();}
  function renderPanel(){const body=$('#panel-body');body.replaceChildren();$('#panel-title').textContent={settings:'Настройки',history:'История сессии',presets:'Пресеты'}[panel]||'';$('#panel-eyebrow').textContent=panel==='history'?`SESSION ${session.id}`:'WORKSPACE';
    if(panel==='history'){const info=document.createElement('div');info.className='history-session';info.textContent=`Сессия ${session.id} · ${new Date(session.started).toLocaleString('ru-RU')} · действий: ${journal.length}`;body.append(info);const list=document.createElement('ol');list.className='history-list';for(const entry of [...journal].reverse()){const li=document.createElement('li');li.className='history-item';const title=document.createElement('strong');title.textContent=entry.label;const time=document.createElement('time');time.dateTime=entry.time;time.textContent=new Date(entry.time).toLocaleTimeString('ru-RU');li.append(title,time);if(entry.detail){const detail=document.createElement('small');detail.textContent=entry.detail;li.append(detail);}list.append(li);}body.append(list);const note=document.createElement('p');note.className='session-info';note.textContent='Изменения и медиа сохраняются на этом компьютере. Готовые генерации попадают в Assets; схема синхронизируется после результата и при следующем открытии страницы.';body.append(note);return;}
    if(panel==='presets'){presetLibrary=mountPresetLibrary(body,{onAdd:applyPreset,compact:true});return;}
    if(panel!=='settings')return;
    if(selectedEdge){renderEdgeSettings(body);return;}
    if(selected.size!==1){body.innerHTML=`<p class="panel-empty">${selected.size?'Выбрано несколько нод. Выбери одну, чтобы изменить её настройки.':'Выбери ноду или связь на поле.'}</p><p class="panel-note">Media и Text подключаются к Video generation, затем Video или Text — к Output.</p>`;return;}
    const n=nodes.get([...selected][0]);if(!n)return;const tag=document.createElement('div');tag.className='panel-node-tag';tag.textContent=`${n.id} · ${nodeName(n)}`;body.append(tag);
    const fields=document.createElement('div');fields.dataset.panelNode=n.id;
    if(n.type==='generation')fields.innerHTML='<p class="panel-note">Промпт — в ноде; модель, референсы и настройки — в панели под ней.</p>';
    if(n.type==='preset')fields.innerHTML='<label>Заголовок<input data-panel-field="heading" maxlength="100"></label><label>Дополнение к промпту<textarea data-panel-field="text" rows="7"></textarea></label><label>Добавлять к промпту<select data-panel-field="enabled"><option value="true">Да</option><option value="false">Нет</option></select></label>';
    if(n.type==='text')fields.innerHTML='<label>Модель<select disabled><option>Не подключена</option></select></label><label>Инструкция<textarea data-panel-field="instruction" rows="3"></textarea></label><label>Текст для передачи<textarea data-panel-field="text" rows="4"></textarea></label><p class="panel-note">Текст можно ввести вручную и передать в Video generation.</p>';
    if(n.type==='media'){const count=document.createElement('p');count.className='panel-note';count.textContent=`Добавлено файлов: ${n.assets.length}`;fields.append(count);const b=document.createElement('button');b.className='secondary-button';b.textContent='Добавить медиа';b.addEventListener('click',()=>$('[data-upload]',n.el).click());fields.append(b);}
    if(n.type==='output'){const src=incoming(n.id)[0];const p=document.createElement('p');p.className='panel-note';p.textContent=src?`Источник: ${src.id}. Результат появится после запуска генерации.`:'Подключи выход Video или Text.';fields.append(p);}
    const nameLabel=document.createElement('label');nameLabel.textContent='Название ноды';const nameInput=document.createElement('input');nameInput.dataset.panelField='name';nameInput.maxLength=80;nameLabel.append(nameInput);fields.prepend(nameLabel);body.append(fields);for(const el of fields.querySelectorAll('[data-panel-field]'))el.value=n.fields[el.dataset.panelField]??'';
    if(n.type==='preset'){const save=document.createElement('button');save.className='secondary-button';save.textContent='Сохранить пресет в библиотеку';save.onclick=()=>saveNodePreset(n);body.append(save);}const remove=document.createElement('button');remove.className='secondary-button';remove.textContent='Удалить ноду';remove.addEventListener('click',deleteSelection);body.append(remove);
  }
  function renderEdgeSettings(body){const e=edges.get(selectedEdge);if(!e)return;body.innerHTML='<form id="connection-form"><label>Откуда<select id="edge-from" required></select></label><label>Куда<select id="edge-to" required></select></label><p id="edge-error" class="panel-error" role="status"></p><button class="primary-button" type="submit">Применить</button><button id="remove-edge" class="secondary-button" type="button">Удалить связь</button></form>';for(const n of nodes.values()){if(n.type!=='output')$('#edge-from').add(new Option(`${n.id} · ${nodeName(n)}`,n.id));if(['generation','text','output'].includes(n.type))$('#edge-to').add(new Option(`${n.id} · ${nodeName(n)}`,n.id));}$('#edge-from').value=e.from;$('#edge-to').value=e.to;$('#remove-edge').addEventListener('click',deleteSelection);$('#connection-form').addEventListener('submit',event=>{event.preventDefault();const from=$('#edge-from').value,to=$('#edge-to').value,id=selectedEdge,error=validLink(from,to,id);if(error){$('#edge-error').textContent=error;return;}mutate('Изменена связь',()=>connectRaw(from,to,id),`${from} → ${to}`);renderPanel();});}
  function applyPreset(p){mutate(`Добавлена пресет-нода «${p.name}»`,()=>{const target=nodes.get(pendingPresetTarget),n=addNode('preset',target?{x:target.x-380,y:target.y}:null,{name:p.name,text:p.text,presetId:p.id,enabled:'true'});if(target)connectRaw(n.id,target.id);});pendingPresetTarget=null;notify('Пресет добавлен. Соедини его с Video или Text.');}
  function menu(open){$('#add-menu').hidden=!open;$('#add-toggle').setAttribute('aria-expanded',String(open));if(open){$('#profile-popover').hidden=true;$('#avatar-button').setAttribute('aria-expanded','false');}}
  // Floating creation rail: keep it visible and let the user move it anywhere inside the Canvas.
  const railWrap=$('.side-rail-wrap'),railGrip=$('#rail-grip'),RAIL_KEY='magic.canvas.rail.v1';
  function clampRail(left,top){const box=railWrap.getBoundingClientRect(),minX=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'))+8||8,minY=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'))+8||8;return {left:Math.max(minX,Math.min(innerWidth-box.width-8,left)),top:Math.max(minY,Math.min(innerHeight-box.height-8,top))};}
  function setRailPosition(left,top,save=true){const p=clampRail(left,top);railWrap.style.left=p.left+'px';railWrap.style.top=p.top+'px';railWrap.style.right='auto';railWrap.style.bottom='auto';railWrap.style.transform='none';if(save)try{localStorage.setItem(RAIL_KEY,JSON.stringify(p));}catch{}}
  try{const saved=JSON.parse(localStorage.getItem(RAIL_KEY)||'null');if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top))requestAnimationFrame(()=>setRailPosition(saved.left,saved.top,false));}catch{}
  railGrip?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();menu(false);const r=railWrap.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;railWrap.classList.add('dragging');railGrip.setPointerCapture(e.pointerId);const move=ev=>setRailPosition(ev.clientX-dx,ev.clientY-dy,false);const end=ev=>{move(ev);railWrap.classList.remove('dragging');try{railGrip.releasePointerCapture(ev.pointerId);}catch{}const rr=railWrap.getBoundingClientRect();setRailPosition(rr.left,rr.top,true);railGrip.removeEventListener('pointermove',move);railGrip.removeEventListener('pointerup',end);railGrip.removeEventListener('pointercancel',end);};railGrip.addEventListener('pointermove',move);railGrip.addEventListener('pointerup',end);railGrip.addEventListener('pointercancel',end);});
  addEventListener('resize',()=>{const r=railWrap.getBoundingClientRect();setRailPosition(r.left,r.top,false);});
  $('#add-toggle').addEventListener('click',()=>menu($('#add-menu').hidden));
  for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',()=>{const type=button.dataset.add;mutate(`Создана нода ${types[type].title}`,()=>addNode(type));setTool('select');menu(false);if(panel==='settings')renderPanel();});
  for(const type of ['settings','history','presets'])$(`#${type}-toggle`).addEventListener('click',()=>openPanel(panel===type?null:type));
  $('#empty-presets').addEventListener('click',()=>openPanel('presets'));$('#close-panel').addEventListener('click',()=>openPanel(null));
  $('#avatar-button').addEventListener('click',()=>{menu(false);const open=$('#profile-popover').hidden;$('#profile-popover').hidden=!open;$('#avatar-button').setAttribute('aria-expanded',String(open));});
  $('#upload-action').addEventListener('click',()=>{pendingUploadLink=null;menu(false);$('#canvas-file-picker').click();});
  function uploadToCanvas(files,p){let count=0;mutate('Добавлены медиа на поле',()=>{for(const file of files){if(!mediaKind(file))continue;const n=addNode('media',{x:p.x+(count%3)*300,y:p.y+Math.floor(count/3)*340},{},[file]);if(pendingUploadLink&&nodes.has(pendingUploadLink))connectRaw(n.id,pendingUploadLink);count++;}},files.map(f=>f.name).join(', '));pendingUploadLink=null;if(!count)notify('Выбери изображение или видео.');else if(count<files.length)notify('Часть файлов пропущена: нужны изображения или видео.');if(panel==='settings')renderPanel();}
  $('#canvas-file-picker').addEventListener('cancel',()=>pendingUploadLink=null);
  $('#canvas-file-picker').addEventListener('change',e=>{const target=nodes.get(pendingUploadLink),p=target?{x:target.x-240,y:target.y+150}:center();uploadToCanvas(Array.from(e.target.files),{x:p.x-135,y:p.y-150});e.target.value='';});
  $('#select-tool').addEventListener('click',()=>setTool('select'));$('#pan-tool').addEventListener('click',()=>setTool('pan'));$('#delete-selection').addEventListener('click',deleteSelection);
  $('#undo').addEventListener('click',undo);$('#redo').addEventListener('click',redo);$('#zoom-in').addEventListener('click',()=>zoomCenter(camera.zoom*1.2));$('#zoom-out').addEventListener('click',()=>zoomCenter(camera.zoom/1.2));$('#zoom-reset').addEventListener('click',()=>zoomCenter(1));$('#fit-view').addEventListener('click',()=>fitView(selected.size>0));
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.composer-settings')){const settings=$('.composer-settings');if(settings)settings.open=false;}if(!e.target.closest('#port-menu,.port'))closePortMenu();if(!e.target.closest('.side-rail-wrap')){menu(false);$('#profile-popover').hidden=true;$('#avatar-button').setAttribute('aria-expanded','false');}});
  function editContext(el){if(el.matches('[data-field]'))return {id:el.closest('.node').dataset.node,field:el.dataset.field};if(el.matches('[data-panel-field]'))return {id:el.closest('[data-panel-node]').dataset.panelNode,field:el.dataset.panelField};return null;}
  document.addEventListener('focusin',e=>{const c=editContext(e.target);if(c){finishEdit();activeEdit={...c,before:snapshot(),el:e.target};}});
  document.addEventListener('input',e=>{const c=editContext(e.target);if(!c)return;const n=nodes.get(c.id);if(!n)return;if(!activeEdit)activeEdit={...c,before:snapshot(),el:e.target};n.fields[c.field]=e.target.value;if(c.field==='higgsfieldModel'&&e.target.value==='bytedance/seedance-2.0'&&Number(n.fields.duration)>15)n.fields.duration='15';syncFields(n,e.target);if(panel==='settings')for(const el of $('#panel-body').querySelectorAll('[data-panel-field]'))if(el!==e.target&&el.closest('[data-panel-node]').dataset.panelNode===n.id)el.value=n.fields[el.dataset.panelField]??'';updateLinkedText();if(c.field==='ratio'||c.field==='duration'||c.field==='resolution'||c.field==='generateAudio'||c.field==='taskMode'||c.field==='higgsfieldModel')renderComposer();saveSession();schedule();});
  document.addEventListener('change',e=>{const c=editContext(e.target);if(!c)return;const n=nodes.get(c.id);if(n){if(!activeEdit)activeEdit={...c,before:snapshot()};n.fields[c.field]=e.target.value;if(c.field==='higgsfieldModel'&&e.target.value==='bytedance/seedance-2.0'&&Number(n.fields.duration)>15)n.fields.duration='15';syncFields(n,e.target);updateLinkedText();finishEdit();renderComposer();}});
  document.addEventListener('focusout',e=>{if(activeEdit?.el===e.target)finishEdit();});
  viewport.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1)return;
    const el=e.target.closest('.node');if(inputTarget(e.target)&&e.button===0){if(el&&!selected.has(el.dataset.node))selectNode(el.dataset.node);return;}
    finishEdit();
    if(e.button===1||space||tool==='pan'){if(e.target.closest('video')&&e.button===0&&!space)return;e.preventDefault();gesture={type:'pan',x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y};viewport.classList.add('is-panning');viewport.setPointerCapture(e.pointerId);return;}
    const port=e.target.closest('.port');if(port){e.preventDefault();closePortMenu();if(draft){finishLink(port);return;}beginPort(port);gesture={type:'wire',x:e.clientX,y:e.clientY,port};viewport.setPointerCapture(e.pointerId);return;}
    const edge=e.target.closest('[data-edge]');if(edge){e.preventDefault();cancelDraft();selectEdge(edge.dataset.edge);return;}
    if(el){const id=el.dataset.node;selectNode(id,e.shiftKey);el.style.zIndex=String(++highestZ);if(e.target.closest('.node-header')&&!e.target.closest('button')&&selected.has(id)){e.preventDefault();viewport.classList.add('is-node-dragging');gesture={type:'nodes',start:worldPoint(e.clientX,e.clientY),before:snapshot(),items:[...selected].map(id=>({id,x:nodes.get(id).x,y:nodes.get(id).y}))};for(const item of gesture.items)nodes.get(item.id).el.classList.add('dragging');}return;}
    if(!e.target.closest('button')){cancelDraft();closePortMenu();const point=worldPoint(e.clientX,e.clientY);viewport.classList.add('is-selecting');gesture={type:'marquee',start:point,base:e.shiftKey?[...selected]:[],shift:e.shiftKey};if(!e.shiftKey){selected.clear();selectedEdge=null;}updateStatus();viewport.setPointerCapture(e.pointerId);e.preventDefault();}
  });
  viewport.addEventListener('pointermove',e=>{
    if(gesture?.type==='pan'){camera.x=gesture.cx+e.clientX-gesture.x;camera.y=gesture.cy+e.clientY-gesture.y;setCamera();return;}
    if(gesture?.type==='nodes'){const p=worldPoint(e.clientX,e.clientY);if(!gesture.moved&&Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)*camera.zoom<3)return;gesture.moved=true;if(!viewport.hasPointerCapture(e.pointerId))viewport.setPointerCapture(e.pointerId);const rect=n=>({x:n.x,y:n.y,width:n.el.offsetWidth,height:n.el.offsetHeight}),moving=gesture.items.map(item=>({...rect(nodes.get(item.id)),x:item.x,y:item.y})),others=[...nodes.values()].filter(n=>!selected.has(n.id)).map(rect),snap=magneticMove(moving,p.x-gesture.start.x,p.y-gesture.start.y,camera.zoom,others,e.altKey);for(const item of gesture.items){const n=nodes.get(item.id);if(n)moveNode(n,item.x+snap.dx,item.y+snap.dy);}showSnapGuides(snap.guides);schedule();return;}
    if(gesture?.type==='marquee'){const end=worldPoint(e.clientX,e.clientY),x=Math.min(gesture.start.x,end.x),y=Math.min(gesture.start.y,end.y),w=Math.abs(end.x-gesture.start.x),h=Math.abs(end.y-gesture.start.y);const box=$('#selection-box');box.hidden=false;Object.assign(box.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});selected.clear();gesture.base.forEach(id=>selected.add(id));for(const n of nodes.values())if(n.x<x+w&&n.x+n.el.offsetWidth>x&&n.y<y+h&&n.y+n.el.offsetHeight>y)selected.add(n.id);updateStatus();return;}
    if(draft){draft.point=worldPoint(e.clientX,e.clientY);renderDraft();}
  });
  function endPointer(e,cancelled=false){showSnapGuides();const previous=gesture;if(previous?.type==='marquee'){$('#selection-box').hidden=true;if(cancelled){selected.clear();previous.base.forEach(id=>selected.add(id));}updateStatus();if(panel==='settings')renderPanel();}
    if(previous?.type==='wire'){const moved=Math.hypot(e.clientX-previous.x,e.clientY-previous.y)>5;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.port');if(cancelled)cancelDraft();else if(target&&draft&&(target.dataset.node!==draft.node||target.dataset.direction!==draft.direction))finishLink(target);else if(moved){const point=worldPoint(e.clientX,e.clientY);cancelDraft();openPortMenu(previous.port,{point,clientX:e.clientX,clientY:e.clientY});}else{cancelDraft();openPortMenu(previous.port);}}
    if(previous?.type==='nodes'){if(cancelled)for(const item of previous.items){const n=nodes.get(item.id);if(n)moveNode(n,item.x,item.y);}else commit(previous.before,'Перемещены ноды',previous.items.map(n=>n.id).join(', '));}
    for(const n of nodes.values())n.el.classList.remove('dragging');gesture=null;viewport.classList.remove('is-panning','is-node-dragging','is-selecting');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);schedule();if(previous?.type==='pan')saveSession();
  }
  viewport.addEventListener('pointerup',e=>endPointer(e));viewport.addEventListener('pointercancel',e=>endPointer(e,true));
  viewport.addEventListener('click',e=>{if(e.detail===0&&e.target.closest('.port'))openPortMenu(e.target.closest('.port')); });
  let cameraSaveTimer;
  document.addEventListener('wheel',e=>{
    if(!(e.ctrlKey||e.metaKey)||!e.target.closest('#viewport,#generation-composer,#selection-actions'))return;
    e.preventDefault();e.stopPropagation();
    zoomAt(camera.zoom*Math.exp(-Math.max(-100,Math.min(100,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1)))*.0012),e.clientX,e.clientY);
  },{passive:false,capture:true});
  viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey||e.target.closest('textarea,select,video,input,.linked-text'))return;e.preventDefault();camera.x-=e.shiftKey?e.deltaY:e.deltaX;camera.y-=e.shiftKey?0:e.deltaY;setCamera();clearTimeout(cameraSaveTimer);cameraSaveTimer=setTimeout(saveSession,300);},{passive:false});
  window.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return;
    if(inputTarget(e.target)||document.querySelector('dialog[open]'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
    if(e.key===' '&&!e.target.closest('button,a,summary')){e.preventDefault();space=true;viewport.classList.add('space-pan');}
    if(e.key==='F2'&&selected.size===1){e.preventDefault();renameNode(nodes.get([...selected][0]));}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelection();}
    if(e.key==='Escape'){closePortMenu();cancelDraft();clearSelection();menu(false);openPanel(null);$('#profile-popover').hidden=true;}
    if(!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='v')setTool('select');if(!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='h')setTool('pan');
  });
  window.addEventListener('keyup',e=>{if(e.key===' '){space=false;viewport.classList.remove('space-pan');}});
  window.addEventListener('blur',()=>{showSnapGuides();$('#selection-box').hidden=true;space=false;if(gesture?.type==='nodes'){const g=gesture;gesture=null;commit(g.before,'Перемещены ноды',g.items.map(i=>i.id).join(', '));}else gesture=null;cancelDraft();viewport.classList.remove('space-pan','is-panning','is-node-dragging','is-selecting');for(const n of nodes.values())n.el.classList.remove('dragging');});
  function hasFiles(e){return e.dataTransfer&&Array.from(e.dataTransfer.types).includes('Files');}
  viewport.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();e.dataTransfer.dropEffect='copy';viewport.classList.add('file-over');}});
  viewport.addEventListener('dragleave',e=>{if(!viewport.contains(e.relatedTarget))viewport.classList.remove('file-over');});
  viewport.addEventListener('drop',e=>{e.preventDefault();viewport.classList.remove('file-over');uploadToCanvas(Array.from(e.dataTransfer.files),worldPoint(e.clientX,e.clientY));});
  window.addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault();});window.addEventListener('drop',e=>e.preventDefault());window.addEventListener('resize',schedule);
  window.addEventListener('magic-integration-changed',()=>{renderComposer();refreshContent();});window.addEventListener('storage',e=>{if(e.key?.startsWith('magic.credentials.'+Studio.current().uid+'.')){renderComposer();refreshContent();}});
  window.addEventListener('pagehide',()=>{for(const n of nodes.values())n.previewSource?.release();finishEdit();saveSession();for(const job of jobs.values())job.controller?.abort();jobs.clear();});document.addEventListener('visibilitychange',()=>{if(document.hidden){finishEdit();saveSession();}});window.addEventListener('pageshow',e=>{if(e.persisted)for(const n of nodes.values())if(n.type==='output')resumeOutput(n);});
  function validSnapshot(s){return s&&Array.isArray(s.nodes)&&Array.isArray(s.edges)&&s.nodes.every(n=>types[n.type]&&/^[MTGOP]\d+$/.test(n.id)&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&Array.isArray(n.assets))&&new Set(s.nodes.map(n=>n.id)).size===s.nodes.length&&s.edges.every(e=>/^E\d+$/.test(e.id)&&s.nodes.some(n=>n.id===e.from)&&s.nodes.some(n=>n.id===e.to));}
  function closePortMenu(){const menu=$('#port-menu');if(menu)menu.hidden=true;portMenuContext=null;}
  function openPortMenu(port,drop=null){
    const n=nodes.get(port.dataset.node);if(!n)return;
    const dir=port.dataset.direction,menu=$('#port-menu');menu.replaceChildren();menu.hidden=false;
    const point=drop?.point||{x:dir==='out'?n.x+n.el.offsetWidth+100:n.x-390,y:n.y};
    portMenuContext={node:n.id,direction:dir,point};
    const label=document.createElement('small');label.textContent=dir==='in'?'Добавить источник':'Продолжить схему';menu.append(label);
    for(const type of MagicDomain.compatible(n.fields.kind==='camera'?'camera':n.type,dir)){
      const button=document.createElement('button');button.textContent={media:'▧ Media',text:'T Text',preset:'▱ Preset',generation:'✦ Video generation',output:'▷ Output'}[type];
      button.onclick=()=>{closePortMenu();mutate('Создана связанная нода',()=>{const created=addNode(type,point);connectRaw(dir==='out'?n.id:created.id,dir==='out'?created.id:n.id);});};menu.append(button);
    }
    if(dir==='in'&&['generation','text'].includes(n.type)){
      const button=document.createElement('button');button.textContent='Пресет из библиотеки';button.onclick=()=>{pendingPresetTarget=n.id;closePortMenu();openPanel('presets');};menu.append(button);
    }
    const connect=document.createElement('button');connect.textContent='Соединить с существующей';connect.onclick=()=>{closePortMenu();beginPort(port);};menu.append(connect);
    const r=port.getBoundingClientRect();menu.style.left=Math.max(viewport.getBoundingClientRect().left+12,Math.min(innerWidth-menu.offsetWidth-12,drop?.clientX??r.right+12))+'px';
    menu.style.top=Math.max(70,Math.min(innerHeight-menu.offsetHeight-16,drop?.clientY??r.top-10))+'px';menu.querySelector('button')?.focus();
  }
  function positionComposer(){
    const host=$('#generation-composer'),n=nodes.get(composerNode);if(!host||host.hidden||!n)return;
    const r=n.el.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
    const left=Math.max(bounds.left+12,Math.min(innerWidth-host.offsetWidth-12,r.left));
    const top=Math.max(bounds.top+12,Math.min(innerHeight-host.offsetHeight-76,r.bottom+14));
    host.style.left=left+'px';host.style.top=top+'px';host.style.bottom='auto';host.style.transform='none';
  }

  const improvingPrompts=new Set();
  async function improveNodePrompt(n){
    if(!n||improvingPrompts.has(n.id))return;finishEdit();const original=n.fields.prompt||'';if(!original.trim()){notify('Сначала напиши идею в поле промпта.');return;}
    improvingPrompts.add(n.id);const button=$('#composer-improve');button.disabled=true;button.textContent='Улучшаю…';
    try{const references=referenceIds(n).map(id=>assets.get(id)).filter(Boolean).map(a=>({kind:a.kind,name:a.name}));const result=await Studio.higgsfieldRequest('improve-prompt',{prompt:original,references,options:{model:selectedVideoProvider(n)==='higgsfield'?(n.fields.higgsfieldModel||'bytedance/seedance-2.5'):'Seedance 2.5',duration:Number(n.fields.duration)||8,resolution:n.fields.resolution,ratio:n.fields.ratio,audio:n.fields.generateAudio!=='false'}});
      if(nodes.get(n.id)!==n||n.fields.prompt!==original){notify('Промпт изменился во время обработки. Твой текущий текст сохранён.');return;}
      if(typeof result.text!=='string'||!result.text.trim())throw Error('Не получен улучшенный текст.');
      mutate('Улучшен промпт по скиллам',()=>{n.fields.prompt=result.text;syncFields(n);updateLinkedText();});saveSession();notify('Промпт улучшен. Отменить: Ctrl+Z.');
    }catch(e){notify(e.message);}finally{improvingPrompts.delete(n.id);if(composerNode===n.id){const b=$('#composer-improve');if(b){b.disabled=false;b.textContent='✦ Улучшить промпт';}}}
  }
  function renderComposer(){const host=$('#generation-composer');if(!host)return;const n=selected.size===1?nodes.get([...selected][0]):null;if(!n||n.type!=='generation'){host.hidden=true;composerNode=null;return;}host.hidden=false;if(composerNode!==n.id){composerNode=n.id;host.dataset.panelNode=n.id;host.innerHTML=`<div class="composer-top"><div class="composer-references"></div><button id="composer-expand" class="icon-button" aria-label="Развернуть панель" title="Развернуть">⤢</button></div><textarea id="composer-prompt" data-panel-field="${n.type==='text'?'instruction':'prompt'}" placeholder="Добавь референсы, опиши идею. Используй @image1 и @video1 для обращения к медиа." aria-label="Промпт" rows="3"></textarea><button type="button" id="composer-improve" class="pill" title="Улучшить текст по загруженным скиллам. Бесплатная квота Cloudflare; видео не запускается.">✦ Улучшить промпт</button><div id="composer-presets"></div><div class="composer-bottom"><label class="model-choice"><span>◇</span><select data-panel-field="model" aria-label="Модель">${n.type==='generation'?'<option value="dreamina-seedance-2-5-260628">Seedance 2.5</option>':'<option value="none">Text · модель не подключена</option>'}</select></label>${n.type==='generation'?`<select data-panel-field="taskMode" class="reference-mode" aria-label="Задача Seedance"><option value="auto">Omni · Авто</option><option value="reference">Новое видео</option><option value="edit">Редактировать видео</option><option value="extend">Продлить видео</option></select><details class="composer-settings"><summary id="composer-settings-label">Settings</summary><div class="settings-popover"><div class="settings-heading"><strong>Settings</strong><span class="settings-heading-actions"><button type="button" id="settings-auto" class="switch-button" title="Вернуть стандартные параметры">Сбросить</button><button type="button" id="settings-close" class="icon-button" aria-label="Закрыть настройки">×</button></span></div><label>Разрешение</label><div class="settings-segments" role="group" aria-label="Разрешение">${['480p','720p','1080p'].map(v=>`<button type="button" data-setting="resolution" data-value="${v}">${v}</button>`).join('')}</div><label>Длительность <span id="duration-label">Авто</span><input type="range" data-panel-field="duration" min="4" max="30" step="1" aria-label="Длительность видео"></label><div class="range-ends"><span>4s</span><span>30s</span></div><label>Формат</label><div class="settings-segments ratios" role="group" aria-label="Формат">${['21:9','16:9','4:3','1:1','3:4','9:16'].map(v=>`<button type="button" data-setting="ratio" data-value="${v}">${v}</button>`).join('')}</div><label class="audio-setting">Аудио<select data-panel-field="generateAudio" aria-label="Аудио"><option value="true">Со звуком</option><option value="false">Без звука</option></select></label></div></details>`:''}<span class="composer-spacer"></span>${n.type==='generation'?'<select data-panel-field="batch" class="batch-choice" aria-label="Количество вариантов"><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option></select>':''}<select data-panel-field="apiProvider" id="composer-api-provider" class="reference-mode" aria-label="API провайдер"><option value="byteplus">BytePlus API</option><option value="higgsfield">Higgsfield API</option>${Studio.activeVideoProvider()==='openrouter'?'<option value="openrouter">OpenRouter API</option>':''}</select><button id="composer-generate" class="pill solid">✦ Generate</button></div><details class="compiled-details"><summary>Итоговый промпт <span id="prompt-source-count"></span></summary><pre id="compiled-prompt"></pre></details><span class="composer-node-name"></span>`;
      for(const b of host.querySelectorAll('[data-setting]'))b.onclick=()=>{mutate('Изменены параметры генерации',()=>{n.fields[b.dataset.setting]=b.dataset.value;syncFields(n);});renderComposer();};
      $('#composer-improve').onclick=()=>improveNodePrompt(nodes.get(composerNode));$('#composer-generate').onclick=()=>startGeneration(nodes.get(composerNode));$('#composer-expand').onclick=()=>{host.classList.toggle('expanded');positionComposer();$('#composer-expand').setAttribute('aria-label',host.classList.contains('expanded')?'Свернуть панель':'Развернуть панель');};$('#settings-close')?.addEventListener('click',()=>$('.composer-settings',host).open=false);$('#settings-auto')?.addEventListener('click',()=>{mutate('Изменены автоматические параметры',()=>{n.fields.ratio='16:9';n.fields.resolution='720p';n.fields.duration='8';n.fields.generateAudio='true';syncFields(n);});renderComposer();});
    }
    for(const el of host.querySelectorAll('[data-panel-field]'))if(el!==document.activeElement)el.value=el.type==='range'&&!n.fields.duration?'4':n.fields[el.dataset.panelField]??'';$('.composer-node-name',host).textContent=nodeName(n);if($('#composer-settings-label'))$('#composer-settings-label').textContent=`${n.fields.resolution||'Авто'} · ${n.fields.duration?n.fields.duration+'s':'Auto'} · ${n.fields.ratio||'Авто'}`;if($('#duration-label'))$('#duration-label').textContent=n.fields.duration?n.fields.duration+'s':'Авто';$('#settings-auto')?.setAttribute('aria-pressed',String(!n.fields.duration&&n.fields.resolution==='Авто'&&n.fields.ratio==='Авто'));$('#composer-api-provider').value=selectedVideoProvider(n);const modelSelect=host.querySelector('select[aria-label="Модель"]');modelSelect.style.width='170px';const hf=selectedVideoProvider(n)==='higgsfield';modelSelect.dataset.panelField=hf?'higgsfieldModel':'model';if(hf){modelSelect.innerHTML='<option value="bytedance/seedance-2.5">Seedance 2.5 · Higgsfield</option><option value="bytedance/seedance-2.0">Seedance 2.0 · Higgsfield</option>';modelSelect.value=n.fields.higgsfieldModel||'bytedance/seedance-2.5';}else{modelSelect.innerHTML='<option value="dreamina-seedance-2-5-260628">Seedance 2.5 · '+MagicProviders.providerName(selectedVideoProvider(n))+'</option>';modelSelect.value=n.fields.model;}const hf20=hf&&n.fields.higgsfieldModel==='bytedance/seedance-2.0';const lengthControl=host.querySelector('[data-panel-field="duration"]');lengthControl.max=hf20?'15':'30';host.querySelector('.range-ends span:last-child').textContent=hf20?'15s':'30s';const capabilities=selectedVideoProvider(n)==='openrouter'?Studio.integrationVerified('openrouter')?.capabilities:null;for(const b of host.querySelectorAll('[data-setting]')){b.setAttribute('aria-pressed',String(n.fields[b.dataset.setting]===b.dataset.value));const supported=b.dataset.setting==='resolution'?capabilities?.supported_resolutions:capabilities?.supported_aspect_ratios;b.disabled=!!supported?.length&&!supported.includes(b.dataset.value);b.title=b.disabled?'Этот параметр пока недоступен у OpenRouter':'';}const taskSelect=host.querySelector('[data-panel-field="taskMode"]');taskSelect.hidden=selectedVideoProvider(n)==='higgsfield';
    const hasVideo=referenceIds(n).some(id=>assets.get(id)?.kind==='video'),mode=n.fields.taskMode||'auto',byteplus=selectedVideoProvider(n)==='byteplus',autoSize=byteplus&&(mode==='edit'||mode==='extend'||(mode==='auto'&&hasVideo)),autoLength=byteplus&&(mode==='edit'||(mode==='auto'&&hasVideo));
    if(autoSize)$('#composer-settings-label').textContent=`${n.fields.resolution||'720p'} · ${autoLength?'Длина исходника':n.fields.duration+'s'} · Формат исходника`;
    const durationInput=host.querySelector('[data-panel-field="duration"]');if(durationInput)durationInput.disabled=autoLength;if(autoLength)$('#duration-label').textContent='Длина исходника (4–30s)';
    if(autoSize)for(const b of host.querySelectorAll('[data-setting="ratio"]')){b.disabled=true;b.title='Формат сохраняется из исходного видео';}
    const improveButton=$('#composer-improve');improveButton.disabled=improvingPrompts.has(n.id);improveButton.textContent=improveButton.disabled?'Улучшаю…':'✦ Улучшить промпт';updateGenerateButtons();refreshComposerAssets();updateLinkedText();positionComposer();
  }
  function refreshComposerAssets(){const n=nodes.get(composerNode);if(!n)return;const host=$('#generation-composer'),container=$('.composer-references',host);if(!container)return;container.replaceChildren();if(n.type==='generation'){const add=document.createElement('label');add.className='ref-upload';add.innerHTML='<span>+</span><small>Ref</small><input type="file" accept="image/*,video/*" multiple hidden aria-label="Добавить референсы">';$('input',add).onchange=e=>{const files=[...e.target.files];mutate('Добавлены референсы',()=>addFiles(n,files));};container.append(add);const link=document.createElement('button');link.className='ref-upload';link.textContent='По ссылке';link.onclick=()=>addUrlReference(n);container.append(link);const list=referenceIds(n).map(id=>({id}));const counts={image:0,video:0};for(const {id} of list){const a=assets.get(id);if(!a)continue;const alias='@'+a.kind+(++counts[a.kind]),chip=document.createElement('div');chip.className='composer-reference';chip.title=a.name;const visual=document.createElement(a.kind==='image'?'img':'video');if(a.url){visual.src=a.url;visual.muted=true;visual.draggable=false;visual.alt=a.name;chip.append(visual);}else{const lost=document.createElement('span');lost.textContent='!';lost.title='Добавь файл повторно';chip.append(lost);}const token=document.createElement('button');token.textContent=alias;token.title='Вставить '+alias+' в промпт';token.onclick=()=>{const field=n.type==='text'?'instruction':'prompt';mutate('Добавлена ссылка на медиа',()=>{n.fields[field]=(n.fields[field]||'')+' '+alias;syncFields(n);updateLinkedText();});};chip.append(token);if(a.kind==='image'&&selectedVideoProvider(n)==='byteplus')chip.append(portraitButton(a));{const remove=document.createElement('button');remove.className='remove-ref';remove.textContent='×';remove.setAttribute('aria-label','Убрать '+a.name);remove.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};remove.onclick=e=>{e.stopPropagation();mutate('Убрано медиа из генерации',()=>removeReference(n,id));};chip.append(remove);}container.append(chip);}}
    const presets=$('#composer-presets');presets.replaceChildren();const linked=incoming(n.id,'preset');for(const [index,p]of linked.entries()){const chip=document.createElement('div');chip.className='linked-preset'+(p.fields.enabled==='false'?' disabled':'');const label=document.createElement('span');label.textContent=(p.fields.kind==='camera'?'◎ ':'▱ ')+nodeName(p);chip.append(label);for(const [step,text]of [[-1,'↑'],[1,'↓']]){const b=document.createElement('button');b.textContent=text;b.disabled=index+step<0||index+step>=linked.length;b.setAttribute('aria-label',step<0?'Переместить пресет выше':'Переместить пресет ниже');b.onclick=()=>mutate('Изменён порядок пресетов',()=>{const ordered=[...edges.values()],i=ordered.findIndex(e=>e.from===p.id&&e.to===n.id),j=ordered.findIndex(e=>e.from===linked[index+step].id&&e.to===n.id);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];edges.clear();ordered.forEach(e=>edges.set(e.id,e));refreshContent();});chip.append(b);}presets.append(chip);}$('#prompt-source-count').textContent=linked.length?`· пресетов: ${linked.length}`:'';
  }
  async function saveNodePreset(n){try{await Studio.ensureTemplates();}catch(e){notify(e.message);return;}const dialog=document.createElement('dialog');dialog.className='studio-dialog';dialog.innerHTML='<header><h2>Сохранить пресет</h2><button type="button" class="icon-button">×</button></header><form class="stack"><label>Название<input name="name" required maxlength="80"></label><label>Папка<select name="folder"></select></label><label>Доступ<select name="scope"><option value="mine">Мой</option></select></label><p class="form-error" role="alert"></p><button class="pill solid" type="submit">Сохранить</button></form>';$('[name=name]',dialog).value=nodeName(n);for(const f of Studio.listFolders())$('[name=folder]',dialog).add(new Option(f.name,f.id));if(Studio.isAdmin())$('[name=scope]',dialog).add(new Option('Общий','common'));$('header button',dialog).onclick=()=>dialog.close();$('form',dialog).onsubmit=async e=>{e.preventDefault();try{await Studio.savePreset({name:$('[name=name]',dialog).value,text:n.fields.text||'',folder:$('[name=folder]',dialog).value,scope:$('[name=scope]',dialog).value});dialog.close();if(panel==='presets')renderPanel();notify('Пресет сохранён в библиотеке');}catch(err){$('.form-error',dialog).textContent=err.message;}};dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();}

  let recovered=false;
  try{
    const remote=SPACE.canvasState,local=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'),candidates=[remote,local].filter(x=>[5,6].includes(x?.version)),data=candidates.sort((a,b)=>(Number(b.savedAt)||0)-(Number(a.savedAt)||0))[0]||null;
    if(data&&validSnapshot(data.state)){session=data.session||session;journal=Array.isArray(data.journal)?data.journal:[];undoStack=(data.undoStack||[]).filter(e=>validSnapshot(e.before)&&validSnapshot(e.after));redoStack=(data.redoStack||[]).filter(e=>validSnapshot(e.before)&&validSnapshot(e.after));for(const key of Object.keys(counters))counters[key]=Number.isInteger(data.counters?.[key])?data.counters[key]:0;edgeSequence=Number.isInteger(data.edgeSequence)?data.edgeSequence:0;for(const a of await Studio.hydrateLocalAssets(data.assets||[]))assets.set(a.id,{...a,uploading:false});if(data.camera&&Object.values(data.camera).every(Number.isFinite)){Object.assign(camera,data.camera);camera.zoom=Math.max(.15,Math.min(3,camera.zoom));}mapVisible=data.mapVisible!==false;restore(data.state);recovered=true;}
  }catch(e){notify('Не удалось восстановить Canvas: '+e.message);}
  if(!recovered)log('Space created');
  $('#minimap-wrap').hidden=!mapVisible;$('#toggle-minimap').setAttribute('aria-pressed',String(mapVisible));$('#toggle-minimap').title=mapVisible?'Скрыть мини-карту':'Показать мини-карту';$('#toggle-minimap').setAttribute('aria-label',$('#toggle-minimap').title);setTool('select');setCamera();updateStatus();
  const url=new URL(location.href),presetId=url.searchParams.get('preset');
  if(presetId){await Studio.ensureTemplates();const preset=Studio.listPresets().find(p=>p.id===presetId);if(preset)applyPreset(preset);else notify('Шаблон не найден.');url.searchParams.delete('preset');try{history.replaceState(null,'',url.href);}catch{}}
  const cameraId=url.searchParams.get('camera');
  if(cameraId){
    const clip=MagicCameraMovements.get(cameraId),intent=url.searchParams.get('insert')||'camera-'+cameraId,key='magic.camera.inserted.'+Studio.current().uid+'.'+SPACE_ID,inserted=Studio.read(key,[]);
    if(clip&&!inserted.includes(intent)&&![...nodes.values()].some(n=>n.fields.cameraInsert===intent)){
      mutate('Добавлен Camera movement',()=>addNode('preset',null,{name:'Camera · '+clip.name,heading:clip.name,text:clip.prompt,kind:'camera',cameraId:clip.id,cameraInsert:intent,enabled:'true'}));
      Studio.write(key,[...inserted,intent].slice(-100));notify('Камера добавлена. Соедини её выход с входом Video generation.');
    }else if(!clip)notify('Движение камеры не найдено.');
    url.searchParams.delete('camera');url.searchParams.delete('insert');history.replaceState(null,'',url.href);
  }
  // Existing completed Outputs already contain their media URL. Do not scan /videos.
  for(const n of nodes.values())if(n.type==='output'){
    if(n.fields.generationId&&!n.fields.videoUrl)resumeOutput(n);else paintOutput(n);
  }
  $('#autosave-state').textContent='Сохранено на компьютере';
})().catch(error=>{Studio.notify('Canvas: '+error.message,'error');const state=document.querySelector('#empty-state');if(state){state.hidden=false;state.textContent='Не удалось открыть Space. Проверь доступ владельца и правила Firebase.';}});
