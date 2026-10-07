(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MagicProviders=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const openRouterModel='bytedance/seedance-2.5';
  const fail=message=>{throw Object.assign(new Error(message),{httpStatus:400,status:400});};
  function source(url,kind){
    if(typeof url!=='string')return false;
    try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password)return true;}catch{}
    return kind==='image'&&/^data:image\/(jpeg|png|webp|bmp|tiff|gif|heic|heif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
  }
  function buildOpenRouterRequest(p={}){
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
  const providerName=p=>p==='openrouter'?'OpenRouter':'BytePlus';
  return {openRouterModel,buildOpenRouterRequest,validateCapabilities,contentUrl,providerName};
});
