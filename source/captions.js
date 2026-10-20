'use strict';
(async()=>{
  if(document.body.dataset.page!=='captions')return;
  const S=Studio,C=MagicCaptions,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],E=S.element;
  await S.ready();if(!await S.requireUser())return;
  const user=S.current(),video=$('#caption-video'),overlay=$('#caption-overlay'),page=$('.captions-page');
  let file=null,fileURL=null,cues=[],language='auto',style='classic',worker=null,job=0,busy=false,activeIndex=-1,raf=0,recorder=null,exportAbort=null,audioEngine=null,fetchAbort=null,selection=0;
  const storageKey=()=>`magic.captions.v1.${user.uid}.${file?.name}|${file?.size}|${file?.lastModified}`;
  const notice=(text,error=false)=>{const el=$('#caption-notice');el.textContent=text;el.classList.toggle('error',error);};
  const languageCodes={english:'en',spanish:'es',portuguese:'pt',romanian:'ro',hungarian:'hu',german:'de',french:'fr',italian:'it',polish:'pl',ukrainian:'uk',russian:'ru'};
  function languageName(value){try{return new Intl.DisplayNames(['ru'],{type:'language'}).of(languageCodes[value]||value);}catch{return value;}}
  function lock(value){
    busy=value;page.classList.toggle('is-busy',value);
    for(const control of page.querySelectorAll('button,input,textarea,select'))control.disabled=value;
    $('#caption-cancel').disabled=false;$('#caption-cancel').hidden=!value;
    $('#caption-recognize').disabled=value||!file;$('#caption-draft').disabled=value||!file;
    $('#caption-progress-wrap').hidden=!value;$('#caption-progress').removeAttribute('value');
  }
  function persist(){
    if(!file)return;
    try{C.validate(cues,video.duration);localStorage.setItem(storageKey(),JSON.stringify({cues,style,size:$('#caption-size').value,position:$('#caption-position').value}));}
    catch(error){notice('Черновик не сохранён: '+error.message,true);}
  }
  function currentGroup(time){return C.groups(cues).find(group=>time>=group.start&&time<group.end);}
  function drawText(ctx,width,height,time){
    const group=currentGroup(time);if(!group)return;
    const fontSize=Math.round(width*Number($('#caption-size').value)/100),pop=style==='pop';
    ctx.save();ctx.font=`${style==='minimal'?'500':'800'} ${fontSize}px Arial, sans-serif`;ctx.textBaseline='middle';
    const maxWidth=width*.86,lines=[];let line=[],lineWidth=0;
    for(const word of group.words){const text=pop?word.text.toUpperCase():word.text,measure=ctx.measureText(text+' ').width;if(line.length&&lineWidth+measure>maxWidth){lines.push(line);line=[];lineWidth=0;}line.push({...word,label:text,width:measure});lineWidth+=measure;}if(line.length)lines.push(line);
    const lineHeight=fontSize*1.2,blockHeight=lines.length*lineHeight,position=$('#caption-position').value;
    const y=position==='top'?height*.16:position==='center'?height*.5-blockHeight/2:height*.80-blockHeight/2;
    lines.forEach((words,row)=>{
      const fullWidth=words.reduce((sum,word)=>sum+word.width,0);let x=(width-fullWidth)/2;
      if(style==='highlight'||style==='minimal'){ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(x-fontSize*.25,y+row*lineHeight-fontSize*.63,fullWidth+fontSize*.5,lineHeight);}
      for(const word of words){
        const active=time>=word.start&&time<word.end;ctx.lineJoin='round';ctx.lineWidth=Math.max(2,fontSize*.105);ctx.strokeStyle='#111';
        ctx.fillStyle=pop?'#edc3ff':style==='highlight'&&active?'#ffe24a':'#fff';
        if(style!=='minimal')ctx.strokeText(word.label,x,y+row*lineHeight);ctx.fillText(word.label,x,y+row*lineHeight);x+=word.width;
      }
    });ctx.restore();
  }
  function paint(){
    const ctx=overlay.getContext('2d');ctx.clearRect(0,0,overlay.width,overlay.height);if(file)drawText(ctx,overlay.width,overlay.height,video.currentTime);
    const index=C.active(cues,video.currentTime);
    if(index!==activeIndex){activeIndex=index;for(const el of $$('[data-cue-index]'))el.classList.toggle('active',Number(el.dataset.cueIndex)===index);}
  }
  function animate(){paint();if(!video.paused&&!video.ended)raf=requestAnimationFrame(animate);}
  video.addEventListener('play',()=>{cancelAnimationFrame(raf);animate();});video.addEventListener('timeupdate',paint);video.addEventListener('seeked',paint);video.addEventListener('pause',paint);
  function renderCues(){
    const list=$('#caption-cues'),timeline=$('#caption-timeline');list.replaceChildren();timeline.replaceChildren();activeIndex=-1;
    $('#caption-editor').hidden=cues.length===0;$('#caption-word-count').textContent='· '+cues.length;
    cues.forEach((cue,index)=>{
      const row=E('div',undefined,'caption-cue');row.dataset.cueIndex=index;
      for(const field of ['start','end','text']){
        const input=E('input');input.type=field==='text'?'text':'number';input.value=field==='text'?cue.text:cue[field].toFixed(3);input.setAttribute('aria-label',`${field==='text'?'Текст':field==='start'?'Начало':'Конец'} субтитра ${index+1}`);
        if(field!=='text'){input.min=0;input.max=video.duration;input.step=.01;}else input.maxLength=200;
        input.onchange=()=>{const old=cue[field];cue[field]=field==='text'?input.value.trim():Number(input.value);try{C.validate(cues,video.duration);persist();renderCues();}catch(error){cue[field]=old;input.value=old;notice(error.message,true);}};row.append(input);
      }
      const remove=E('button','×');remove.setAttribute('aria-label','Удалить субтитр '+(index+1));remove.onclick=()=>{cues.splice(index,1);persist();renderCues();};row.append(remove);list.append(row);
      const marker=E('button',cue.text);marker.dataset.cueIndex=index;marker.style.width=Math.max(45,(cue.end-cue.start)*80)+'px';marker.title=C.time(cue.start,'.')+' — '+C.time(cue.end,'.');marker.onclick=()=>{video.currentTime=cue.start;paint();};timeline.append(marker);
    });paint();
  }
  async function selectFile(next){
    if(busy)return;
    if(!next||next.size>200*1024*1024||!next.size){notice('Выбери непустое видео до 200 МБ.',true);return;}
    if(!/^video\//.test(next.type)&&! /\.(mp4|webm|mov|m4v|mkv)$/i.test(next.name)){notice('Нужен видеофайл MP4, WebM или MOV.',true);return;}
    const token=++selection;fetchAbort?.abort();video.pause();if(fileURL)URL.revokeObjectURL(fileURL);
    file=next;fileURL=URL.createObjectURL(next);cues=[];video.src=fileURL;video.hidden=false;$('#caption-preview-empty').hidden=true;
    $('#caption-file-name').textContent=next.name;$('#caption-language-info').textContent=language==='auto'?'Язык будет определён заново по речи в этом видео.':'Выбран язык речи: '+languageName(language)+'. Субтитры будут без перевода.';$('#caption-recognize').disabled=true;$('#caption-draft').disabled=true;renderCues();notice('Чтение видео…');
    try{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('Браузер не смог открыть это видео. Попробуй MP4 с H.264/AAC.')),15000);const loaded=()=>finish();const failed=()=>finish(new Error('Формат видео не поддерживается браузером.'));function finish(error){clearTimeout(timer);video.removeEventListener('loadedmetadata',loaded);video.removeEventListener('error',failed);error?reject(error):resolve();}video.addEventListener('loadedmetadata',loaded,{once:true});video.addEventListener('error',failed,{once:true});});
      if(token!==selection)return;
      if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>300)throw new Error('Выбери видео длительностью до 5 минут.');
      overlay.width=video.videoWidth||720;overlay.height=video.videoHeight||1280;$('#caption-stage').style.aspectRatio=overlay.width+'/'+overlay.height;
      const saved=S.read(storageKey(),null);
      if(saved?.cues){try{C.validate(saved.cues,video.duration);cues=saved.cues;style=['classic','highlight','minimal','pop'].includes(saved.style)?saved.style:'classic';$('#caption-size').value=Math.max(3,Math.min(9,Number(saved.size)||5.5));$('#caption-position').value=['top','center','bottom'].includes(saved.position)?saved.position:'bottom';updateStyleButtons();renderCues();}catch{}}
      $('#caption-recognize').disabled=false;$('#caption-draft').disabled=false;notice(cues.length?'Локальный черновик восстановлен.':'Видео готово. Распознай речь или создай черновик из текста.');paint();
    }catch(error){if(token===selection){file=null;notice(error.message,true);}}
  }
  $('#caption-drop').onclick=()=>$('#caption-file').click();$('#caption-file').onchange=event=>selectFile(event.target.files[0]);
  for(const type of ['dragenter','dragover'])$('#caption-drop').addEventListener(type,event=>{event.preventDefault();if(!busy)$('#caption-drop').classList.add('dragging');});
  for(const type of ['dragleave','drop'])$('#caption-drop').addEventListener(type,event=>{event.preventDefault();$('#caption-drop').classList.remove('dragging');if(type==='drop'&&!busy)selectFile(event.dataTransfer.files[0]);});
  for(const button of $$('[data-language]'))button.onclick=()=>{language=button.dataset.language;for(const b of $$('[data-language]')){const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}$('#caption-language-info').textContent=language==='auto'?'Язык будет определён заново по речи в этом видео.':'Выбран язык речи: '+languageName(language)+'. Нажми «Распознать речь», чтобы применить его.';};
  function updateStyleButtons(){for(const button of $$('[data-caption-style]')){const active=button.dataset.captionStyle===style;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);}}
  for(const button of $$('[data-caption-style]'))button.onclick=()=>{style=button.dataset.captionStyle;updateStyleButtons();persist();paint();};
  for(const control of [$('#caption-size'),$('#caption-position')])control.oninput=()=>{persist();paint();};
  $('#caption-draft').onclick=()=>{
    const text=$('#caption-script').value.trim();if(!text){notice('Вставь текст ролика или нажми «Распознать речь».',true);return;}
    if(cues.length&&!confirm('Заменить текущие субтитры черновиком из текста?'))return;
    cues=C.draft(text,video.duration);persist();renderCues();notice('Черновик создан. Время распределено равномерно, без распознавания речи. Проверь и поправь таймкоды.');
  };
  $('#caption-add').onclick=()=>{const start=cues.at(-1)?.end||0;if(start>=video.duration-.02){notice('В конце нет свободного времени. Сократи последний интервал.',true);return;}cues.push({start,end:Math.min(video.duration,start+.5),text:'Текст'});persist();renderCues();};
  function download(blob,name){const url=URL.createObjectURL(blob),link=E('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const baseName=()=>file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'-');
  for(const format of ['srt','vtt'])$('#caption-'+format).onclick=()=>{try{C.validate(cues,video.duration);download(new Blob([C.serialize(cues,format)],{type:format==='vtt'?'text/vtt;charset=utf-8':'application/x-subrip;charset=utf-8'}),baseName()+'.'+format);}catch(error){notice(error.message,true);}};
  async function decodeAudio(input){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Этот браузер не поддерживает обработку аудио. Открой страницу в актуальном Chrome или Edge.');
    const context=new Audio({sampleRate:16000});
    try{
      const buffer=await context.decodeAudioData(await input.arrayBuffer());
      const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000),source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
      const rendered=await offline.startRendering();return rendered.getChannelData(0).slice();
    }catch{throw new Error('Не удалось прочитать звук. Проверь, что видео содержит речь, и попробуй MP4 с аудио AAC или WebM с Opus.');}
    finally{await context.close();}
  }
  $('#caption-recognize').onclick=async()=>{
    if(!file||busy)return;if(cues.length&&!confirm('Распознать заново и заменить текущие субтитры?'))return;
    const id=++job;lock(true);notice('Подготовка аудио на устройстве…');
    try{
      const audio=await decodeAudio(file);if(id!==job)return;
      if(!audio.some(value=>Math.abs(value)>.0001))throw new Error('В видео не найден звук. Можно создать субтитры из текста.');
      worker||=new Worker(new URL('assets/captions/whisper-worker.js?v=0.9.1',location.href),{type:'module'});
      worker.onmessage=({data})=>{
        if(data.id!==job)return;
        if(data.type==='status'||data.type==='progress')notice(data.text);
        if(data.type==='language')$('#caption-language-info').textContent=(data.automatic?'Определён язык: ':'Выбран язык: ')+languageName(data.language)+'. Субтитры будут на языке оригинала.';
        if(data.type==='result'){
          cues=C.normalize(data.chunks,video.duration);lock(false);
          if(!cues.length){notice('Речь с таймкодами не найдена. Попробуй выбрать язык или создать черновик из текста.',true);return;}
          persist();renderCues();notice('Готово. Проверь текст и таймкоды — распознавание может ошибаться. Черновик сохранён в этом браузере.');
        }
        if(data.type==='error'){if(data.code==='LANGUAGE_UNCERTAIN'){lock(false);notice(data.text,true);return;}worker?.terminate();worker=null;lock(false);notice('Whisper не запустился: '+data.text+'. Проверь интернет для загрузки модели или создай черновик из текста.',true);}
      };
      worker.onerror=()=>{if(id!==job)return;worker?.terminate();worker=null;++job;lock(false);notice('Не удалось загрузить локальный Whisper. Проверь интернет и поддержку WebAssembly; доступен ручной черновик.',true);};
      worker.postMessage({id,audio,language},[audio.buffer]);
    }catch(error){if(id===job){lock(false);notice(error.message,true);}}
  };
  $('#caption-cancel').onclick=()=>{
    if(exportAbort){exportAbort();notice('Отмена экспорта…');return;}
    ++job;++selection;fetchAbort?.abort();worker?.terminate();worker=null;lock(false);notice('Операция отменена. Текущие субтитры сохранены.');
  };
  async function seek(time){
    if(Math.abs(video.currentTime-time)<.005)return;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('Не удалось перейти к началу видео.')),8000);const done=()=>finish();function finish(error){clearTimeout(timer);video.removeEventListener('seeked',done);error?reject(error):resolve();}video.addEventListener('seeked',done,{once:true});video.currentTime=time;});
  }
  $('#caption-export-video').onclick=async()=>{
    if(busy||!file||!cues.length)return;
    let stream,frame=0,aborted=false,oldTime=video.currentTime,oldMuted=video.muted,oldVolume=video.volume,oldRate=video.playbackRate;
    try{
      C.validate(cues,video.duration);
      if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw new Error('Этот браузер не поддерживает экспорт видео. Скачай SRT/VTT или открой Chrome/Edge.');
      const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('Подходящий формат записи не поддерживается. Доступен экспорт SRT/VTT.');
      lock(true);exportAbort=()=>{aborted=true;video.pause();if(recorder&&recorder.state!=='inactive')recorder.stop();};video.controls=false;video.pause();video.playbackRate=1;await seek(0);if(aborted)return;video.muted=false;video.volume=1;
      const canvas=document.createElement('canvas'),scale=Math.min(1,1920/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);const ctx=canvas.getContext('2d');
      if(!audioEngine){const context=new (window.AudioContext||window.webkitAudioContext)(),source=context.createMediaElementSource(video),destination=context.createMediaStreamDestination();source.connect(context.destination);source.connect(destination);audioEngine={context,destination};}
      await audioEngine.context.resume();if(aborted)return;stream=canvas.captureStream(30);for(const track of audioEngine.destination.stream.getAudioTracks())stream.addTrack(track.clone());
      const blobs=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});recorder.ondataavailable=event=>{if(event.data.size)blobs.push(event.data);};
      const draw=()=>{ctx.drawImage(video,0,0,canvas.width,canvas.height);drawText(ctx,canvas.width,canvas.height,video.currentTime);frame=requestAnimationFrame(draw);};
      const finish=()=>{if(recorder?.state!=='inactive')recorder.stop();};
      exportAbort=()=>{aborted=true;video.pause();finish();};
      const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=event=>reject(new Error(event.error?.message||'Ошибка записи видео.'));});
      video.addEventListener('ended',finish,{once:true});
      try{
        draw();recorder.start(1000);await video.play();notice('Экспорт видео… Не скрывай вкладку до завершения. Можно отменить.');
        const timeout=setTimeout(()=>{aborted=true;finish();},(video.duration+30)*1000);
        try{await stopped;}finally{clearTimeout(timeout);}
      }finally{video.removeEventListener('ended',finish);}
      if(!aborted&&blobs.length){const mp4=mime.startsWith('video/mp4');download(new Blob(blobs,{type:mime}),baseName()+'-captions.'+(mp4?'mp4':'webm'));notice('Видео с субтитрами готово. Формат: '+(mp4?'MP4':'WebM')+'.');}
      else if(aborted)notice('Экспорт отменён или приостановлен браузером. Субтитры сохранены; можно повторить.');
    }catch(error){notice(error.message,true);}
    finally{if(recorder?.state==='recording')recorder.stop();cancelAnimationFrame(frame);video.pause();stream?.getTracks().forEach(track=>track.stop());video.controls=true;video.muted=oldMuted;video.volume=oldVolume;video.playbackRate=oldRate;exportAbort=null;recorder=null;try{await seek(oldTime);}catch{}lock(false);paint();}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&exportAbort)exportAbort();});
  for(const tab of $$('[data-caption-tab]'))tab.onclick=async()=>{
    const mine=tab.dataset.captionTab==='mine';$('#caption-file-tab').hidden=mine;$('#caption-mine-tab').hidden=!mine;for(const button of $$('[data-caption-tab]'))button.classList.toggle('active',button===tab);
    if(!mine)return;
    const list=$('#caption-mine-list');list.replaceChildren(E('p','Загрузка…','muted'));
    try{
      const rows=(await S.listVideos()).filter(row=>row.uid===user.uid&&row.status==='completed');list.replaceChildren();
      for(const row of rows){const button=E('button',(row.prompt||'Без промпта').slice(0,90));button.append(E('small',`${row.seconds||'?'} сек. · ${row.resolution||''}`));button.onclick=async()=>{
        let source;const token=++selection;
        try{lock(true);notice('Загрузка выбранного видео…');fetchAbort=new AbortController();source=await S.resolveVideoSource(row);const response=await fetch(source.url,{signal:fetchAbort.signal});if(!response.ok)throw new Error('Ссылка недоступна: '+response.status);const blob=await response.blob();if(token!==selection)return;lock(false);await selectFile(new File([blob],'magic-'+row.id+'.mp4',{type:blob.type.startsWith('video/')?blob.type:'video/mp4',lastModified:Number(row.createdAt)||0}));}
        catch(error){if(token===selection){lock(false);notice('Не удалось загрузить видео. Ссылка могла истечь или CDN запрещает запрос. Скачай видео и выбери его во вкладке «Файл».',true);}}
        finally{source?.release();if(token===selection)lock(false);}
      };list.append(button);}
      if(!rows.length)list.append(E('p','Готовых генераций пока нет. Можно загрузить файл.','muted'));
    }catch(error){list.replaceChildren(E('p',error.message,'muted'));}
  };
  window.addEventListener('pagehide',()=>{++job;++selection;worker?.terminate();fetchAbort?.abort();exportAbort?.();cancelAnimationFrame(raf);if(fileURL)URL.revokeObjectURL(fileURL);audioEngine?.context.close();});
  paint();
})().catch(error=>Studio.notify('Captions: '+error.message,'error'));
