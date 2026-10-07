window.MagicVideoViewer=(()=>{
  const E=(tag,text,cls)=>Studio.element(tag,text,cls);
  async function copy(text){
    try{await navigator.clipboard.writeText(text);}catch{const input=E('textarea');input.value=text;input.style.cssText='position:fixed;opacity:0;pointer-events:none';(document.querySelector('dialog[open]')||document.body).append(input);input.select();if(!document.execCommand('copy')){input.remove();throw new Error('Не удалось скопировать промпт.');}input.remove();}
    Studio.notify('Промпт скопирован');
  }
  function show(record,{mode='assets'}={}){
    document.querySelector('.media-preview-dialog')?.close();
    const dialog=E('dialog',undefined,'media-preview-dialog');dialog.dataset.previewMode=mode;dialog.setAttribute('aria-label',mode==='assets'?'Предпросмотр генерации':'Предпросмотр видео');
    const shell=E('div',undefined,'media-preview-shell'),close=E('button','×','media-preview-close');close.setAttribute('aria-label','Закрыть предпросмотр');close.onclick=()=>dialog.close();
    const stage=E('div',undefined,'media-preview-stage'),video=E('video'),notice=E('p','Загружаем видео…','media-preview-notice');video.controls=true;video.playsInline=true;video.setAttribute('controlsList','nofullscreen');video.setAttribute('disablePictureInPicture','');video.hidden=true;stage.append(video,notice);shell.append(close,stage);
    const actions=E('div',undefined,'media-preview-actions'),download=E('button','↓ Скачать видео','ui-button primary');download.onclick=async()=>{download.disabled=true;try{await Studio.downloadVideo(record);}catch(e){Studio.notify(e.message,'error');}finally{download.disabled=false;}};actions.append(download);
    if(mode==='assets'){
      const promptToggle=E('button','Промпт','ui-button'),infoToggle=E('button','Описание','ui-button'),promptPanel=E('div',undefined,'media-preview-details'),infoPanel=E('div',undefined,'media-preview-details');promptPanel.hidden=infoPanel.hidden=true;promptPanel.id='video-preview-prompt';infoPanel.id='video-preview-info';
      const prompt=E('button',record.prompt||'Промпт не сохранён','media-preview-prompt');prompt.title='Нажми, чтобы скопировать полный промпт';prompt.setAttribute('aria-label','Скопировать полный промпт');prompt.onclick=()=>copy(record.prompt||'').catch(e=>Studio.notify(e.message,'error'));promptPanel.append(prompt);
      const dl=E('dl',undefined,'media-preview-info');
      for(const [label,value]of [['Создал',record.user||record.uid||'—'],['Дата',Studio.timestamp(record.createdAt)?new Date(Studio.timestamp(record.createdAt)).toLocaleString('ru-RU'):'—'],['Модель',record.model||'—'],['Провайдер',MagicProviders.providerName(record.provider)],['Формат',record.ratio||'—'],['Качество / разрешение',record.resolution||'—'],['Длительность',record.seconds?record.seconds+' сек.':'—'],['Аудио',record.generateAudio===false?'Без звука':'Со звуком']]){dl.append(E('dt',label),E('dd',value));}infoPanel.append(dl);
      for(const [toggle,panel]of [[promptToggle,promptPanel],[infoToggle,infoPanel]]){toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};}
      actions.prepend(promptToggle,infoToggle);shell.append(actions,promptPanel,infoPanel);
    }else shell.append(actions);
    dialog.append(shell);document.body.append(dialog);let source,closed=false;
    const resize=()=>{const [w,h]=String(record.ratio||'16:9').split(':').map(Number),ratio=video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:w/h||16/9,maxHeight=innerHeight*(mode==='assets'?.58:.76),width=Math.min(innerWidth*.86,maxHeight*ratio,video.videoWidth||1280);stage.style.width=width+'px';stage.style.aspectRatio=String(ratio);if(mode==='assets')dialog.style.width=Math.min(innerWidth*.94,Math.max(width+30,Math.min(620,innerWidth*.9)))+'px';};
    dialog.onclose=()=>{closed=true;video.pause();video.removeAttribute('src');video.load();source?.release();removeEventListener('resize',resize);dialog.remove();};dialog.onclick=e=>{if(e.target===dialog)dialog.close();};dialog.addEventListener('keydown',e=>e.stopPropagation());
    video.onloadedmetadata=resize;video.onerror=()=>{notice.hidden=false;notice.textContent='Не удалось воспроизвести видео. Ссылка могла истечь или формат недоступен.';};addEventListener('resize',resize);resize();dialog.showModal();
    Studio.resolveVideoSource(record).then(result=>{if(closed){result.release();return;}source=result;notice.hidden=true;video.hidden=false;video.src=result.url;video.play().catch(()=>{});}).catch(e=>{if(!closed){notice.textContent=e.message;download.disabled=true;}});
    return dialog;
  }
  return {show,copy};
})();
