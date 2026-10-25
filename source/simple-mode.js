'use strict';
(async()=>{
  if(document.body.dataset.page!=='simple')return;
  const S=Studio,$=q=>document.querySelector(q),E=S.element;
  await S.ready();if(!await S.requireUser())return;
  const space=await S.ensureSimpleSpace(),me=S.current(),key='magic.simple.'+me.uid;
  const defaults={model:'bytedance/seedance-2.5',prompt:'',duration:5,ratio:'9:16',resolution:'480p',audio:true,bitrate:'high'};
  let draft={...defaults},refs=[],busy=false,uploading=0,timer,saveChain=Promise.resolve(),lastImprovement=null;
  const tracking=new Map(),rows=new Map(),controllers=new Map();
  let local=null;try{local=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  const remote=space.canvasState;const saved=local&&(local.savedAt||0)>(remote?.savedAt||0)?local:remote;
  if(saved?.state?.simpleDraft){draft={...defaults,...saved.state.simpleDraft};refs=await S.hydrateLocalAssets((saved.assets||[]).map(a=>({...a,url:a.url||a.referenceUrl||null})));}
  const model=$('#sm-model'),prompt=$('#sm-prompt'),duration=$('#sm-duration'),ratio=$('#sm-ratio'),resolution=$('#sm-resolution'),bitrate=$('#sm-bitrate'),audio=$('#sm-audio');
  const isByte=()=>draft.model==='byteplus',isKling=()=>draft.model==='kling-video/v4.0';
  const name=()=>isByte()?'BytePlus · Seedance 2.5':isKling()?'Higgsfield · Kling 4.0':draft.model.endsWith('2.0')?'Higgsfield · Seedance 2.0':'Higgsfield · Seedance 2.5';
  const note=(text,error=false)=>{const n=$('#sm-status');n.textContent=text;n.classList.toggle('error-text',error);};
  function payload(){return {version:1,savedAt:Date.now(),state:{nodes:refs.map(a=>({id:'ref-'+a.id,type:'media',assets:[a.id]})),edges:[],simpleDraft:{...draft}},assets:refs.map(a=>({...a,url:a.url?.startsWith('blob:')?a.referenceUrl||null:a.url}))};}
  function save(){
    const value=payload();try{localStorage.setItem(key,JSON.stringify(value));}catch{note('Не удалось сохранить черновик на устройстве.',true);}
    $('#sm-save-state').textContent='Сохраняем…';clearTimeout(timer);
    timer=setTimeout(()=>{saveChain=saveChain.catch(()=>{}).then(()=>S.saveSpaceState(space.id,value)).then(()=>$('#sm-save-state').textContent='Личный Space · сохранено').catch(()=>$('#sm-save-state').textContent='Сохранено на устройстве · облако недоступно');},700);
  }
  const panels=[...document.querySelectorAll('.sm-setting')];
  function closeSettings(){for(const panel of panels)panel.open=false;}
  function options(field,values){
    const host=$('#'+field.id+'-choices'),setting=field.id.replace('sm-','');host.replaceChildren();
    for(const value of values){const button=E('button',value==='high'?'High — меньше сжатия':value==='standard'?'Standard — меньше файл':value,'sm-choice');button.type='button';button.disabled=busy;button.setAttribute('aria-pressed',String(draft[setting]===value));button.onclick=()=>{if(busy)return;draft[setting]=value;closeSettings();update();save();};host.append(button);}
  }
  function normalize(){
    if(!['bytedance/seedance-2.5','bytedance/seedance-2.0','kling-video/v4.0','byteplus'].includes(draft.model))draft.model=defaults.model;
    const kling=isKling(),max=draft.model.endsWith('2.0')?15:30;draft.duration=Math.max(4,Math.min(max,Math.round(Number(draft.duration)||5)));
    if(kling&&!['720p','1080p'].includes(draft.resolution))draft.resolution='720p';
    if(!['480p','720p','1080p'].includes(draft.resolution))draft.resolution='480p';
    if(!(kling?['21:9','16:9','9:16','1:1']:['21:9','16:9','4:3','1:1','3:4','9:16']).includes(draft.ratio))draft.ratio='9:16';
    if(!['high','standard'].includes(draft.bitrate))draft.bitrate='high';
    draft.prompt=String(draft.prompt||'').slice(0,32000);
  }
  MagicReferencePrompts.attach(prompt,()=>isByte()?[]:refs);
  function update(){
    normalize();model.value=draft.model;prompt.value=draft.prompt;duration.max=draft.model.endsWith('2.0')?'15':'30';duration.value=draft.duration;
    options(ratio,isKling()?['21:9','16:9','9:16','1:1']:['21:9','16:9','4:3','1:1','3:4','9:16']);ratio.value=draft.ratio;
    options(resolution,isKling()?['720p','1080p']:['480p','720p','1080p']);resolution.value=draft.resolution;options(bitrate,['high','standard']);bitrate.value=draft.bitrate;$('#sm-duration-number').max=duration.max;if(document.activeElement!==$('#sm-duration-number'))$('#sm-duration-number').value=draft.duration;
    $('#sm-duration-value').textContent=draft.duration+' сек.';$('#sm-duration-max').textContent=duration.max+'s';$('#sm-ratio-value').textContent=draft.ratio;$('#sm-resolution-value').textContent=draft.resolution;$('#sm-bitrate-value').textContent=draft.bitrate==='high'?'High':'Standard';
    audio.textContent=draft.audio?'♪ Звук включён':'♪ Без звука';audio.setAttribute('aria-pressed',String(draft.audio));audio.hidden=isKling();prompt.placeholder=isKling()?'Опиши сцену, движение и камеру. Референсы: @image_1, @video_1…':'Опиши сцену, движение и камеру. Референсы: @image1, @video1…';
    $('#sm-reference-section').hidden=isByte();$('#sm-bitrate-setting').hidden=draft.model!=='bytedance/seedance-2.5';
    $('#sm-provider-label').textContent=name();$('#sm-model-help').textContent=isByte()?'Генерация только по тексту. Референсы из других моделей не отправляются.':isKling()?'Kling 4.0 · фото и видеореференсы · 720p/1080p. Звук и битрейт задаёт модель.':'Фото, видео и аудио · новый ролик по референсам с выбранной длиной и форматом.';
    $('#sm-files').accept=isKling()?'image/jpeg,image/png,image/webp,video/mp4,video/quicktime':'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg';
    $('#sm-generate').disabled=busy||uploading>0;$('#sm-generate').textContent=busy?'Подготовка…':uploading?'Загрузка референсов…':'✦ Generate video';
    const active=isByte()?[]:refs,vid=active.filter(a=>a.kind==='video'),known=vid.every(a=>Number(a.duration)>0);
    const cost=MagicDomain.estimateCost({provider:isByte()?'byteplus':'higgsfield',model:draft.model,seconds:draft.duration,resolution:draft.resolution,ratio:draft.ratio,videoReferenceCount:vid.length,inputVideoSeconds:known?vid.reduce((sum,a)=>sum+Number(a.duration),0):null});
    $('#sm-cost').textContent=cost==null?'Цена уточняется API перед запуском':MagicDomain.money(cost)+' ≈ · предварительная оценка, без скидки';
    renderRefs();MagicReferencePrompts.refresh();
  }
  function renderRefs(){
    const box=$('#sm-reference-list');box.replaceChildren();const counts={};
    for(const item of refs){const kind=item.kind||'image',alias=(isKling()?'@'+kind+'_':'@'+kind)+(counts[kind]=(counts[kind]||0)+1),card=E('article',undefined,'sm-reference');
      if(item.url){const media=E(kind==='image'?'img':kind==='audio'?'audio':'video');media.src=item.url;if(kind==='image')media.alt=item.name;else{media.controls=true;media.preload='metadata';}card.append(media);}else card.append(E('span','Добавь файл повторно','muted'));
      const label=E('span',alias,'sm-ref-alias');label.title=item.name;card.append(label);const remove=E('button','×','sm-ref-remove');remove.type='button';remove.title='Удалить '+item.name;remove.setAttribute('aria-label','Удалить '+alias);remove.disabled=busy;remove.onclick=()=>{refs=refs.filter(a=>a.id!==item.id);update();save();};card.append(remove);box.append(card);
    }
    $('#sm-ref-empty').hidden=refs.length>0;$('#sm-ref-count').textContent=refs.length+'/15';
  }
  async function addFiles(files){
    if(busy||isByte())return;uploading++;update();
    try{for(const file of files){if(refs.length>=15)throw Error('Максимум 15 референсов.');if(isKling()&&file.type.startsWith('audio/'))throw Error('Kling 4.0 не принимает аудиореференсы.');
      let item=await S.storeLocalAsset(file,space.id);if(item.kind==='video'){item.duration=await new Promise(resolve=>{const video=document.createElement('video'),timeout=setTimeout(()=>{video.removeAttribute('src');resolve(null);},8000);video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timeout);resolve(Number.isFinite(video.duration)?video.duration:null);};video.onerror=()=>{clearTimeout(timeout);resolve(null);};video.src=item.url;});}
      refs.push(item);update();save();}
      note('Референсы добавлены. Их можно удалить крестиком.');
    }catch(error){note(error.message,true);}finally{uploading--;$('#sm-files').value='';update();}
  }
  $('#sm-files').onchange=e=>addFiles([...e.target.files]);const drop=$('#sm-reference-drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');addFiles([...e.dataTransfer.files]);};
  $('#sm-add-url').onclick=async e=>{e.preventDefault();if(busy||isByte())return;try{if(refs.length>=15)throw Error('Максимум 15 референсов.');const item=await S.storeReferenceUrl($('#sm-ref-url').value.trim(),space.id);refs.push(item);$('#sm-ref-url').value='';update();save();}catch(error){note(error.message,true);}};
  $('#sm-elements').onclick=()=>MagicAvatars.open({add:async avatar=>{if(busy||isByte())throw Error('Выбери модель с поддержкой референсов.');if(refs.length>=15)throw Error('Максимум 15 референсов.');const item=await S.storeReferenceUrl(avatar.image_url,space.id);refs.push({...item,name:avatar.name,avatarId:avatar.id});update();save();note('Аватар добавлен в References.');}});
  model.onchange=()=>{draft.model=model.value;update();save();};prompt.oninput=()=>{draft.prompt=prompt.value;save();};
  function setDuration(value){const n=Number(value),max=Number(duration.max);if(Number.isInteger(n)&&n>=4&&n<=max){draft.duration=n;update();save();}}
  duration.oninput=()=>setDuration(duration.value);duration.onchange=closeSettings;$('#sm-duration-number').oninput=()=>setDuration($('#sm-duration-number').value);$('#sm-duration-number').onchange=()=>{normalize();$('#sm-duration-number').value=draft.duration;closeSettings();};
  audio.onclick=()=>{draft.audio=!draft.audio;update();save();};
  // Close synchronously before native <details> toggles, rather than racing its
  // deferred toggle events. Also close outside, on Escape and before Generate.
  for(const panel of panels){panel.querySelector('summary').addEventListener('click',event=>{event.preventDefault();const opening=!panel.open;closeSettings();if(opening)panel.open=true;});}
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.sm-setting'))closeSettings();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSettings();});
  $('#sm-improve').onclick=async()=>{const original=prompt.value;if(!original.trim()){note('Добавь идею для промпта.',true);return;}const button=$('#sm-improve');button.disabled=true;button.textContent='Улучшаю…';
    try{const selected=draft.model,kling=isKling(),result=await S.higgsfieldRequest('improve-prompt',{prompt:kling?original.replace(/@(image|video)_(\d+)/g,'@$1$2'):original,references:(isByte()?[]:refs).map(a=>({kind:a.kind,name:a.name})),options:{model:selected,duration:draft.duration,resolution:draft.resolution,ratio:draft.ratio,audio:draft.audio}});if(prompt.value!==original||draft.model!==selected)throw Error('Промпт или модель изменились во время улучшения. Твой текст сохранён; нажми улучшение ещё раз.');if(typeof result.text!=='string'||!result.text.trim())throw Error('ИИ не вернул промпт.');const text=kling?result.text.replace(/@(image|video)(\d+)/g,'@$1_$2'):result.text;lastImprovement={original,improved:text};draft.prompt=text;update();save();$('#sm-undo-improve').hidden=false;note('Промпт улучшен. Генерация не запускалась.');}
    catch(error){note(error.message,true);}finally{button.disabled=false;button.textContent='✦ Улучшить промпт';}
  };
  $('#sm-undo-improve').onclick=()=>{if(lastImprovement&&prompt.value===lastImprovement.improved){draft.prompt=lastImprovement.original;update();save();}$('#sm-undo-improve').hidden=true;};
  function renderHistory(){
    const host=$('#sm-results');host.replaceChildren();const sorted=[...rows.values()].sort((a,b)=>S.timestamp(b.createdAt)-S.timestamp(a.createdAt));$('#sm-history-count').textContent=String(sorted.length);$('#sm-welcome').hidden=sorted.length>0;
    for(const row of sorted){const card=E('article',undefined,'sm-result'),head=E('div',undefined,'sm-result-heading');head.append(E('strong',row.model?.includes('kling')?'Kling 4.0':row.model?.includes('2.0')?'Seedance 2.0':'Seedance 2.5'),E('span',MagicDomain.costLabel(row)));card.append(head);
      if(row.status==='completed'&&(row.videoUrl||row.remoteUrl)){const video=E('video');video.src=row.videoUrl||row.remoteUrl;video.controls=true;video.playsInline=true;video.preload='metadata';card.append(video);const download=E('button','↓ Скачать видео','ui-button');download.onclick=()=>S.downloadVideo(row).catch(e=>note(e.message,true));card.append(download);}
      else {card.append(E('div',row.status==='submission_unknown'?'Запуск не подтверждён · проверь Requests':row.status==='failed'?'Ошибка генерации':row.status==='cancelled'?'Отменено':'Генерация · '+(row.pct||0)+'%','sm-result-pending'));}
      card.append(E('p',row.prompt||'Без промпта','sm-result-prompt'),E('small',(row.provider==='higgsfield'?'Higgsfield':'BytePlus')+' · '+row.seconds+' сек. · '+row.resolution+' · '+row.ratio,'muted'));
      if(row.error||row.trackingWarning)card.append(E('p',row.error||row.trackingWarning,'error-text'));
      if(row.requestId)card.append(E('small','Request ID: '+row.requestId,'muted'));
      if(!MagicDomain.terminal(row.status)&&row.requestId&&!tracking.has(row.id)){const resume=E('button','Обновить статус','ui-button');resume.onclick=()=>track(row);card.append(resume);}
      host.append(card);
    }
  }
  function track(record){if(tracking.has(record.id)||!record.requestId)return;const controller=new AbortController();controllers.set(record.id,controller);tracking.set(record.id,true);
    S.watchGeneration(record,item=>{rows.set(item.id,item);renderHistory();},{signal:controller.signal}).then(item=>{rows.set(item.id,item);}).catch(error=>{rows.set(record.id,{...rows.get(record.id),trackingWarning:error.message});}).finally(()=>{tracking.delete(record.id);controllers.delete(record.id);renderHistory();});
  }
  async function history(){const videos=await S.listVideos();rows.clear();for(const row of [...videos,...S.pendingVideos(space.id)])if(row.uid===me.uid&&row.spaceId===space.id)rows.set(row.id,row);renderHistory();for(const row of rows.values())if(!MagicDomain.terminal(row.status)&&row.requestId)track(row);}
  $('#sm-refresh').onclick=()=>history().catch(e=>note(e.message,true));
  function confirmPaid(snapshot){return new Promise(resolve=>{const dialog=$('#sm-confirm'),label=$('#sm-confirm-description');label.textContent=name()+' · '+snapshot.duration+' сек. · '+snapshot.resolution+' · '+snapshot.ratio+'. Новая платная генерация через Higgsfield. Цена может быть выше BytePlus; модерация референсов действует. '+$('#sm-cost').textContent;dialog.returnValue='';dialog.onclose=()=>resolve(dialog.returnValue==='confirm');dialog.showModal();});}
  function lock(value){busy=value;for(const control of document.querySelectorAll('#sm-form input,#sm-form select,#sm-form textarea,#sm-form button'))control.disabled=value;update();}
  $('#sm-form').onsubmit=async event=>{
    event.preventDefault();closeSettings();if(busy||uploading)return;draft.prompt=prompt.value.trim();if(!draft.prompt){note('Опиши видео в промпте.',true);return;}
    const snapshot={...draft},provider=isByte()?'byteplus':'higgsfield',active=provider==='byteplus'?[]:refs.map(a=>({...a}));lock(true);let record=null;
    try{
      if(provider==='higgsfield'&&!await confirmPaid(snapshot))return;
      const credentials=await S.providerCredentials(provider);if(!credentials)throw Error('Подключи '+provider+' в My settings.');
      if(provider==='higgsfield'){const config=await S.higgsfieldRequest('config');if(!config.ready)throw Error('Higgsfield не подключён.');if(!config.models?.includes(snapshot.model))throw Error('Обнови Higgsfield Worker для выбранной модели.');}
      const prepared=[];for(const item of active){if(!item.url)throw Error('Добавь повторно недоступный референс '+item.name);const ready=await S.ensureRemoteAsset(item,{provider});prepared.push(ready);const ownRef=refs.find(a=>a.id===item.id);if(ownRef)ownRef.referenceUrl=ready.referenceUrl;}
      const videos=prepared.filter(a=>a.kind==='video'),known=videos.every(a=>Number(a.duration)>0),options={model:provider==='byteplus'?MagicDomain.defaultVideoModel:snapshot.model,prompt:provider==='higgsfield'&&snapshot.model==='kling-video/v4.0'?snapshot.prompt.replace(/@(image|video)(\d+)/g,'@$1_$2'):snapshot.prompt,duration:snapshot.duration,resolution:snapshot.resolution,aspect_ratio:snapshot.ratio,generate_audio:snapshot.audio,taskMode:'reference',omni_reference_task_type:'reference',forceReference:true,reference_images:prepared.filter(a=>a.kind==='image').map(a=>a.referenceUrl),reference_videos:videos.map(a=>a.referenceUrl),reference_audio:prepared.filter(a=>a.kind==='audio').map(a=>a.referenceUrl),...(snapshot.model==='bytedance/seedance-2.5'?{bitrate_mode:snapshot.bitrate}:{})};
      options.simpleMode=true;if(provider==='higgsfield'){MagicProviders.buildHiggsfieldRequest(options);options.higgsfieldConfirmed=true;}else await S.prepareVideoRequest(provider,options);
      record=await S.createVideoRecord({spaceId:space.id,spaceName:'Simple Mode',provider,model:options.model,prompt:options.prompt,seconds:snapshot.duration,resolution:snapshot.resolution,ratio:snapshot.ratio,generateAudio:snapshot.audio,bitrateMode:options.bitrate_mode,taskMode:'reference',referenceCount:prepared.length,videoReferenceCount:videos.length,inputVideoSeconds:known?videos.reduce((sum,a)=>sum+Number(a.duration),0):null,hasRef:prepared.length>0,transport:credentials.mode,gatewayUrl:credentials.workerUrl||null});
      rows.set(record.id,{...record,status:'submitting'});renderHistory();const submitted=await S.submitGeneration(record.id,options,provider);rows.set(submitted.id,submitted);renderHistory();track(submitted);note('Запрос отправлен. Результат появится здесь и в Assets; стоимость входит в общий Cost.');save();
    }catch(error){if(record){const failed=await S.updateVideo(record.id,{status:error.httpStatus>=400&&error.httpStatus<500?'failed':'submission_unknown',error:error.message});rows.set(record.id,failed);renderHistory();}note(error.message,true);}finally{lock(false);}
  };
  window.addEventListener('pagehide',()=>{clearTimeout(timer);for(const controller of controllers.values())controller.abort();S.queueSpaceState(space.id,payload());});
  update();await history();
})().catch(error=>Studio.notify(error.message||String(error),'error'));
