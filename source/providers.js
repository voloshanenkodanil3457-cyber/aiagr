(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MagicProviders=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const openRouterModel='bytedance/seedance-2.5';
  const fail=message=>{throw Object.assign(new Error(message),{httpStatus:400,status:400});};
  function source(url,kind){
    if(typeof url!=='string')return false;
    try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password)return true;}catch{}
    return kind==='image'&&/^data:image\/(jpeg|png|webp|bmp|tiff|gif|heic|heif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
  }
  function isFaceRejection(error){return /may contain (?:a )?real person|PrivacyInformation[.:_-]*RealPerson|real.person.{0,70}(?:not supported|not allowed|prohibit)|(?:face|portrait).{0,40}(?:verification required|authorization required)/i.test(String(error||''));}
  function higgsfieldModel(value){const model=value||'bytedance/seedance-2.5';if(!['bytedance/seedance-2.5','bytedance/seedance-2.0','kling-video/v4.0'].includes(model))fail('Неизвестная модель Higgsfield.');return model;}
  function buildHiggsfieldRequest(p={}){
    const model=higgsfieldModel(p.model);if(model==='kling-video/v4.0')return buildKlingRequest(p);
    const maxDuration=model.endsWith('2.0')?15:30;
    const images=p.reference_images||[],videos=p.reference_videos||[],audio=p.reference_audio||[],prompt=String(p.prompt||'').trim();
    if(!prompt||prompt.length>32000)fail('Добавь промпт до 32000 символов.');
    if(!Array.isArray(images)||!Array.isArray(videos)||!Array.isArray(audio)||images.length+videos.length+audio.length>15)fail('Максимум 15 референсов.');
    if([...images,...videos,...audio].some(u=>typeof u!=='string'||!source(u,'video')))fail('Higgsfield нужны публичные HTTPS-референсы.');
    const duration=Number(p.duration),ratio=p.aspect_ratio||p.ratio,mode=p.taskMode||p.omni_reference_task_type||'auto',editing=model.endsWith('2.5')&&videos.length>0&&['auto','edit'].includes(mode);
    if(mode==='edit'&&!videos.length)fail('Для редактирования Higgsfield добавь исходное видео.');
    if(mode==='extend')fail('Продление через Higgsfield пока не подключено. Выбери новое видео или редактирование.');
    if(!Number.isInteger(duration)||duration<4||duration>maxDuration)fail('Для выбранной модели Higgsfield длина: 4–'+maxDuration+' секунд.');
    if(!['16:9','4:3','1:1','3:4','9:16','21:9'].includes(ratio))fail('Для Higgsfield выбери явный формат видео.');
    if(!['480p','720p','1080p'].includes(p.resolution))fail('Выбери разрешение Higgsfield.');
    if(model.endsWith('2.0')&&(images.length>9||videos.length>3||audio.length>3))fail('Seedance 2.0: до 9 изображений, 3 видео и 3 аудио.');
    if(audio.length&&!images.length&&!videos.length&&model.endsWith('2.0'))fail('Для Seedance 2.0 к аудио нужен фото- или видеореференс.');
    const input={prompt,duration,resolution:p.resolution,generate_audio:p.generate_audio!==false};
    if(model.endsWith('2.5')){if(p.bitrate_mode!==undefined&&!['standard','high'].includes(p.bitrate_mode))fail('Выбери High или Standard.');if(p.bitrate_mode)input.bitrate_mode=p.bitrate_mode;}
    if(audio.length)input.audio_urls=audio;
    if(model.endsWith('2.0'))delete input.output_format;
    let endpoint=model+'/text-to-video';
    if(editing){endpoint=model+'/video-edit';input.video_url=videos[0];if(images.length)input.image_urls=images;if(videos.length>1)input.video_urls=videos.slice(1);delete input.duration;}
    else if(videos.length||images.length>1||audio.length||p.forceReference&&images.length){endpoint=model+'/reference-to-video';if(images.length)input.image_urls=images;if(videos.length)input.video_urls=videos;input.aspect_ratio=ratio;}
    else if(images.length){endpoint=model+'/image-to-video';input.image_url=images[0];}
    else {input.aspect_ratio=ratio;if(model.endsWith('2.5'))input.output_format='mp4';}
    return {endpoint,input};
  }
  function buildKlingRequest(p={}){
    const prompt=String(p.prompt||'').trim(),images=p.reference_images||[],videos=p.reference_videos||[],audio=p.reference_audio||[];
    if(!prompt||prompt.length>32000)fail('Добавь промпт до 32000 символов.');
    if(!Array.isArray(images)||!Array.isArray(videos)||!Array.isArray(audio)||images.length>10||videos.length>5||audio.length)fail('Kling 4.0: до 10 изображений и 5 видео; аудиореференсы не поддерживаются.');
    if([...images,...videos].some(url=>!source(url,'video')))fail('Kling нужны публичные HTTPS-референсы.');
    const duration=Number(p.duration),ratio=p.aspect_ratio||p.ratio;
    if(!Number.isInteger(duration)||duration<3||duration>30)fail('Kling 4.0: длительность 3–30 секунд.');
    if(!['720p','1080p'].includes(p.resolution))fail('Kling 4.0: выбери 720p или 1080p.');
    if(!['21:9','16:9','9:16','1:1'].includes(ratio))fail('Kling 4.0: выбери 21:9, 16:9, 9:16 или 1:1.');
    if(['edit','extend'].includes(p.taskMode))fail('В Simple Mode Kling создаёт новое видео по референсам.');
    const input={prompt,duration,resolution:p.resolution,aspect_ratio:ratio};
    if(images.length)input.image_urls=images;if(videos.length)input.video_urls=videos;
    return {endpoint:'kling-video/v4.0/'+(images.length||videos.length?'reference-to-video':'text-to-video'),input};
  }
  function byteplusTask(p={}){
    const mode=p.omni_reference_task_type||'auto',videos=p.reference_videos||[],hasVideo=Array.isArray(videos)&&videos.length>0;
    if(!['auto','reference','edit','extend'].includes(mode))fail('Неизвестный режим Seedance.');
    if(['edit','extend'].includes(mode)&&!hasVideo)fail('Для редактирования или продления добавь видеореференс.');
    const adaptive=mode==='edit'||mode==='extend'||(mode==='auto'&&hasVideo),sourceDuration=mode==='edit'||(mode==='auto'&&hasVideo);
    const duration=sourceDuration?-1:Number(p.duration??8),ratio=adaptive?'adaptive':p.aspect_ratio||p.ratio||'16:9';
    if(duration!==-1&&(!Number.isInteger(duration)||duration<4||duration>30))fail('Длительность: 4–30 секунд или автоматически.');
    if(!['adaptive','21:9','16:9','4:3','1:1','3:4','9:16'].includes(ratio))fail('Неподдерживаемый формат видео.');
    return {...p,duration,ratio,aspect_ratio:ratio,omni_reference_task_type:mode};
  }
  function buildOpenRouterRequest(p={}){
    if(['edit','extend'].includes(p.omni_reference_task_type))fail('Режим редактирования и продления подключён для BytePlus. Выбери BytePlus в My settings.');
    const prompt=String(p.prompt||'').trim();if(!prompt||prompt.length>32000)fail('Промпт должен содержать от 1 до 32000 символов.');
    const images=p.reference_images||[],videos=p.reference_videos||[];
    if(!Array.isArray(images)||!Array.isArray(videos)||images.length+videos.length>15)fail('Допускается до 15 референсов.');
    if(images.some(u=>!source(u,'image'))||videos.some(u=>!source(u,'video')))fail('Для OpenRouter нужны HTTPS-ссылки или изображения Base64. BytePlus asset:// не переносится между провайдерами.');
    const body={model:openRouterModel,prompt,generate_audio:p.generate_audio!==false};
    if(p.duration!==undefined){const v=Number(p.duration);if(!Number.isInteger(v)||v<4||v>30)fail('Длительность: 4–30 секунд.');body.duration=v;}
    if(p.resolution)body.resolution=p.resolution;
    const ratio=p.aspect_ratio||p.ratio;if(ratio&&ratio!=='adaptive')body.aspect_ratio=ratio;
    if(Number.isInteger(Number(p.seed))&&Number(p.seed)>=0)body.seed=Number(p.seed);
    const frames=[];for(const [frame_type,url]of [['first_frame',p.first_frame_url],['last_frame',p.last_frame_url]])if(url){if(!source(url,'image'))fail('Неподдерживаемый кадр.');frames.push({type:'image_url',image_url:{url},frame_type});}
    if(frames.length)body.frame_images=frames;
    if(images.length||videos.length)body.input_references=[...images.map(url=>({type:'image_url',image_url:{url}})),...videos.map(url=>({type:'video_url',video_url:{url}}))];
    if(JSON.stringify(body).length>60*1024*1024)fail('Референсы превышают 60 МБ.');return body;
  }
  function validateCapabilities(body,model){
    if(!model||model.id!==openRouterModel)fail('Seedance 2.5 не найдена в доступных видеомоделях OpenRouter. Нажми «Проверить» в My settings.');
    for(const [field,list,label]of [['duration','supported_durations','Длительность'],['resolution','supported_resolutions','Разрешение'],['aspect_ratio','supported_aspect_ratios','Формат']]){
      if(body[field]!==undefined&&Array.isArray(model[list])&&model[list].length&&!model[list].includes(body[field]))fail(`${label} ${body[field]} не поддерживается OpenRouter. Доступно: ${model[list].join(', ')}.`);
    }
    return body;
  }
  function contentUrl(taskId){if(typeof taskId!=='string'||!/^[\w-]{1,180}$/.test(taskId))fail('Некорректный ID задачи OpenRouter.');return 'https://openrouter.ai/api/v1/videos/'+encodeURIComponent(taskId)+'/content';}
  const providerName=p=>p==='higgsfield'?'Higgsfield':p==='openrouter'?'OpenRouter':'BytePlus';
  return {higgsfieldModel,isFaceRejection,buildHiggsfieldRequest,byteplusTask,openRouterModel,buildOpenRouterRequest,validateCapabilities,contentUrl,providerName};
});
