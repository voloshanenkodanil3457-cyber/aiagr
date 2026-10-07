(async()=>{
  if(document.body.dataset.page!=='camera')return;
  await Studio.ready();if(!await Studio.requireUser())return;
  const E=Studio.element,C=MagicCameraMovements,grid=document.querySelector('#camera-grid'),search=document.querySelector('#camera-search'),filters=document.querySelector('#camera-filters');let category='all',videos=[];
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const video=entry.target;if(entry.isIntersecting&&!document.hidden){if(!video.src)video.src=video.dataset.src;video.play().catch(()=>{});}else video.pause();}},{rootMargin:'40px',threshold:.1});
  function observe(){videos.forEach(v=>observer.observe(v));}
  function render(){observer.disconnect();videos.forEach(v=>{v.pause();v.removeAttribute('src');v.load();});videos=[];grid.replaceChildren();const rows=C.filter(search.value,category);
    document.querySelector('#camera-results').textContent=rows.length+' примеров';document.querySelector('#camera-empty').hidden=rows.length>0;
    for(const clip of rows){
      const card=E('article',undefined,'camera-card');card.dataset.cameraId=clip.id;
      const preview=E('div',undefined,'camera-preview'),video=E('video'),fallback=E('span','Пример недоступен','camera-preview-error');video.dataset.src=clip.url;video.muted=true;video.loop=true;video.playsInline=true;video.preload='metadata';video.controls=true;video.setAttribute('controlsList','nodownload nofullscreen');video.setAttribute('aria-label',clip.name);fallback.hidden=true;video.onerror=()=>fallback.hidden=false;preview.append(video,fallback);videos.push(video);
      const body=E('div',undefined,'camera-card-body'),meta=E('div',undefined,'camera-shot-meta');meta.append(E('span','Shot '+clip.id),E('span',clip.category));body.append(meta,E('h2',clip.name));
      const prompt=E('p',clip.prompt,'camera-card-prompt');prompt.tabIndex=0;prompt.setAttribute('aria-label','Промпт '+clip.name);body.append(prompt);
      const actions=E('div',undefined,'camera-card-actions'),copy=E('button','Copy prompt','ui-button'),use=E('button','Turn into video ↗','ui-button primary');copy.onclick=()=>MagicVideoViewer.copy(clip.prompt).catch(e=>Studio.notify(e.message,'error'));use.onclick=()=>chooseSpace(clip);actions.append(copy,use);body.append(actions);card.append(preview,body);grid.append(card);
    }observe();
  }
  for(const value of ['all',...C.categories]){const count=value==='all'?C.clips.length:C.clips.filter(c=>c.category===value).length,button=E('button',undefined,'camera-filter');button.dataset.category=value;button.append(E('span',value==='all'?'All':value),E('small',String(count)));button.setAttribute('aria-pressed',String(value===category));button.onclick=()=>{category=value;filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();};filters.append(button);}
  async function chooseSpace(clip){
    const dialog=E('dialog',undefined,'studio-dialog camera-space-dialog'),header=E('header'),close=E('button','×','icon-button');header.append(E('h2','Camera movement · '+clip.name),close);close.setAttribute('aria-label','Закрыть');close.onclick=()=>dialog.close();
    const body=E('div',undefined,'stack'),description=E('p','Выбери Space. Пресет камеры появится отдельной нодой — соедини её с Video generation.','panel-note'),select=E('select'),label=E('label','Твой Space'),error=E('p','Загружаем Spaces…','form-error'),add=E('button','Добавить пресет камеры','ui-button primary');label.append(select);add.disabled=true;body.append(description,label,error,add);dialog.append(header,body);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.onclick=e=>{if(e.target===dialog)dialog.close();};dialog.showModal();
    try{const spaces=await Studio.listSpaces();if(!dialog.isConnected)return;
      if(!spaces.length){error.textContent='Сначала создай свой Canvas Space.';const link=E('a','Открыть Spaces','ui-button');link.href='spaces.html';body.append(link);return;}
      for(const space of spaces)select.add(new Option(space.name||'Untitled',space.id));error.textContent='';add.disabled=false;
      add.onclick=()=>{const selected=spaces.find(s=>s.id===select.value);if(!selected||selected.ownerUid!==Studio.current().uid)return;const url=new URL('nodes.html',location.href);url.searchParams.set('space',selected.id);url.searchParams.set('camera',clip.id);url.searchParams.set('insert',Studio.uid());location.href=url.href;};
    }catch(e){if(dialog.isConnected)error.textContent=e.message;}
  }
  search.oninput=render;render();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)videos.forEach(v=>v.pause());else{observer.disconnect();observe();}});
  window.addEventListener('pagehide',()=>{observer.disconnect();videos.forEach(v=>v.pause());});
})().catch(e=>Studio.notify('Camera movement: '+e.message,'error'));
