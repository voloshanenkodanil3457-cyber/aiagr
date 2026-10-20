'use strict';
(async()=>{
  if(document.body.dataset.page!=='editor')return;
  const S=Studio,C=MagicEditor,$=s=>document.querySelector(s),E=S.element;
  await S.ready();if(!await S.requireUser())return;
  const page=$('.editor-page'),canvas=$('#edit-canvas'),ctx=canvas.getContext('2d'),layer=document.createElement('canvas'),layerCtx=layer.getContext('2d');
  let media=[],clips=[],selected=null,plan=[],time=0,total=0,playing=false,exporting=false,loading=false,raf=0,clock=0,recorder=null,aborted=false,seekVersion=0,audio=null,mix=null;
  const status=(text,error=false)=>{$('#edit-status').textContent=text;$('#edit-status').classList.toggle('error',error);};
  const current=()=>clips.find(c=>c.id===selected);
  function lock(){
    page.classList.toggle('is-exporting',exporting);
    page.querySelectorAll('button,input,select').forEach(el=>el.disabled=loading||playing||exporting);
    $('#edit-play').disabled=loading||exporting||!clips.length;$('#edit-play').textContent=playing?'❚❚ Пауза':'▶ Смотреть';
    $('#edit-scrub').disabled=loading||exporting||!clips.length;
    $('#edit-export').disabled=loading||playing||exporting||!clips.length;
    $('#edit-cancel').hidden=!exporting;$('#edit-cancel').disabled=false;$('#edit-progress').hidden=!exporting;
    page.querySelectorAll('[data-boundary]').forEach(el=>el.disabled=true);
  }
  function audioSetup(){
    if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();mix=audio.createMediaStreamDestination();}
    for(const c of clips)if(!c.gain){c.source=audio.createMediaElementSource(c.video);c.gain=audio.createGain();c.gain.gain.value=0;c.source.connect(c.gain);c.gain.connect(audio.destination);c.gain.connect(mix);}
    return audio.resume();
  }
  function silence(){for(const c of clips){c.video.pause();if(c.gain)c.gain.gain.value=0;}}
  function seek(video,value){
    value=Math.min(Math.max(0,value),Math.max(0,video.duration-.001));
    if(Math.abs(video.currentTime-value)<.005&&video.readyState>=2)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',ok);video.removeEventListener('error',bad);};
      const ok=()=>{done();resolve();},bad=()=>{done();reject(Error('Не удалось прочитать кадр видео. Попробуй другой файл.'));};
      const timer=setTimeout(bad,10000);video.addEventListener('seeked',ok);video.addEventListener('error',bad);video.currentTime=value;
    });
  }
  function fit(video){
    const scale=Math.min(canvas.width/video.videoWidth,canvas.height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;
    if(w&&h)layerCtx.drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  }
  function draw(at){
    ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(layer.width!==canvas.width||layer.height!==canvas.height){layer.width=canvas.width;layer.height=canvas.height;}
    for(const c of C.frame(plan,at)){layerCtx.fillStyle='#000';layerCtx.fillRect(0,0,layer.width,layer.height);fit(c.video);ctx.globalAlpha=c.alpha;ctx.drawImage(layer,0,0);}ctx.globalAlpha=1;
    $('#edit-scrub').value=String(at);$('#edit-time').textContent=`${at.toFixed(2)} / ${total.toFixed(2)} с`;
    if(exporting)$('#edit-progress').value=total?at/total:0;
  }
  async function preview(at){
    const version=++seekVersion;time=Math.max(0,Math.min(at,Math.max(0,total-.001)));silence();
    try{await Promise.all(C.frame(plan,time).map(c=>seek(c.video,c.sourceTime)));if(version===seekVersion&&!playing)draw(time);}
    catch(error){status(error.message,true);}
  }
  function refresh(preserveFields=false){
    plan=C.schedule(clips);total=plan.at(-1)?.end||0;
    $('#edit-count').textContent=`${clips.length} клипов · ${total.toFixed(2)} с`;
    $('#edit-scrub').max=String(total);$('#edit-track').replaceChildren();
    for(const c of plan){
      const card=E('div',undefined,'editor-clip'+(c.id===selected?' selected':''));card.draggable=true;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Клип ${c.index+1}: ${c.name}`);
      card.append(E('strong',`${c.index+1}. ${c.name}`),E('small',`${c.in.toFixed(2)}–${c.out.toFixed(2)} с · ${c.length.toFixed(2)} с`),E('small',c.index&&c.overlap?`${c.transition==='black'?'Через чёрный':'Растворение'} · ${c.overlap.toFixed(2)} с`:'Без перехода'));
      card.onclick=()=>{if(playing||exporting||loading)return;selected=c.id;refresh();preview(c.start);};
      card.onkeydown=e=>{if(e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();card.click();}};
      card.ondragstart=e=>{if(playing||exporting||loading){e.preventDefault();return;}e.dataTransfer.setData('application/x-magic-clip',c.id);e.dataTransfer.effectAllowed='move';};
      card.ondragover=e=>e.preventDefault();card.ondrop=e=>{e.preventDefault();e.stopPropagation();drop(e,c.index);};
      for(const [label,delta] of [['←',-1],['→',1]]){const b=E('button',label,'ui-button');b.title=delta<0?'Сдвинуть раньше':'Сдвинуть позже';if(c.index+delta<0||c.index+delta>=clips.length)b.dataset.boundary='true';b.onclick=e=>{e.stopPropagation();if(playing||exporting||loading)return;clips=C.move(clips,c.index,c.index+delta);refresh();preview(0);};card.append(b);}
      $('#edit-track').append(card);
    }
    if(!clips.length)$('#edit-track').append(E('p','Перетащи видео из медиа на дорожку или нажми + у файла.','muted'));
    const c=current();$('#edit-inspector').hidden=!c;
    if(c&&!preserveFields){$('#edit-selected').textContent=c.name;$('#edit-in').value=c.in.toFixed(3);$('#edit-out').value=c.out.toFixed(3);$('#edit-in').max=c.duration;$('#edit-out').max=c.duration;$('#edit-transition').value=c.transition;$('#edit-fade').value=c.fade;$('#edit-muted').checked=c.muted;}
    lock();
  }
  async function addClip(asset){
    if(playing||exporting||loading)return;
    if(clips.length>=20){status('На дорожке может быть до 20 клипов.',true);return;}
    if(clips.reduce((n,c)=>n+c.out-c.in,0)+asset.duration>300){status('Сборка ограничена 5 минутами. Сначала обрежь или удали клипы.',true);return;}
    loading=true;lock();
    const video=document.createElement('video');video.src=asset.url;video.preload='auto';video.playsInline=true;video.muted=false;
    try{await loaded(video);const c={id:crypto.randomUUID(),name:asset.name,duration:asset.duration,in:0,out:asset.duration,transition:'cut',fade:.5,muted:false,video};clips.push(c);selected=c.id;refresh();await preview(plan.at(-1).start);status('Клип добавлен. Выбери его на дорожке для обрезки и перехода.');}
    catch(error){video.removeAttribute('src');video.load();status(error.message,true);}finally{loading=false;lock();}
  }
  function loaded(video){return new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);};const ok=()=>{done();resolve();},bad=()=>{done();reject(Error('Браузер не смог открыть видео. Попробуй MP4 (H.264) или WebM.'));};const timer=setTimeout(bad,15000);video.addEventListener('loadeddata',ok);video.addEventListener('error',bad);if(video.readyState>=2)ok();else video.load();});}
  async function importFiles(files){
    if(loading||playing||exporting)return;loading=true;lock();
    try{for(const file of files){
      if(media.length>=20){status('В медиатеке максимум 20 файлов.',true);break;}
      if(file.size>200*1024*1024){status(`${file.name}: файл больше 200 МБ.`,true);continue;}
      const url=URL.createObjectURL(file),probe=document.createElement('video');probe.src=url;probe.preload='auto';probe.muted=true;
      try{await loaded(probe);if(!Number.isFinite(probe.duration)||probe.duration<.1||probe.duration>300)throw Error('Видео должно быть от 0,1 секунды до 5 минут.');
        const asset={id:crypto.randomUUID(),name:file.name,duration:probe.duration,url};media.push(asset);
        if(media.length===1)$('#edit-bin').replaceChildren();const row=E('div',undefined,'editor-media');row.draggable=true;const name=E('span',asset.name);name.append(E('small',`${asset.duration.toFixed(2)} с`));const add=E('button','+ На дорожку','ui-button');add.onclick=()=>addClip(asset);row.append(name,add);row.ondragstart=e=>e.dataTransfer.setData('application/x-magic-media',asset.id);$('#edit-bin').append(row);status('Видео добавлено в медиа. Перетащи его на дорожку или нажми +.');
      }catch(error){URL.revokeObjectURL(url);status(`${file.name}: ${error.message}`,true);}finally{probe.removeAttribute('src');probe.load();}
    }}finally{loading=false;lock();$('#edit-files').value='';}
  }
  function drop(event,index=clips.length){
    if(loading||playing||exporting)return;
    const id=event.dataTransfer.getData('application/x-magic-clip'),asset=event.dataTransfer.getData('application/x-magic-media');
    if(id){const from=clips.findIndex(c=>c.id===id);if(from>=0){clips=C.move(clips,from,Math.min(index,clips.length-1));refresh();preview(0);}}
    else if(asset){const item=media.find(m=>m.id===asset);if(item)addClip(item);}
    else if(event.dataTransfer.files.length)importFiles(event.dataTransfer.files);
  }
  function stop(){playing=false;cancelAnimationFrame(raf);silence();if(recorder?.state==='recording')recorder.stop();lock();}
  async function start(){
    loading=true;lock();
    try{await audioSetup();silence();++seekVersion;
    await Promise.all(plan.map(c=>seek(c.video,Math.max(c.in,Math.min(c.out-.001,c.in+time-c.start)))));}
    finally{loading=false;lock();}
    if(exporting&&(aborted||document.hidden)){aborted=true;stop();status('Экспорт отменён. Держи вкладку открытой и видимой.',true);return;}
    playing=true;const active=C.frame(plan,time);
    for(const c of active){c.video.volume=1;c.video.playbackRate=1;await c.video.play();}
    clock=performance.now();lock();
    function tick(now){
      if(!playing)return;time=Math.min(total,time+(now-clock)/1000);clock=now;
      try{
        const frames=C.frame(plan,Math.min(time,total-.001)),ids=new Set(frames.map(c=>c.id));
        for(const c of clips){if(!ids.has(c.id)){c.video.pause();c.gain.gain.value=0;}}
        for(const f of frames){const c=clips.find(c=>c.id===f.id);if(c.video.error)throw Error('Не удалось воспроизвести клип '+c.name);c.gain.gain.value=c.muted?0:f.gain;if(c.video.paused&&time<f.end-.03)c.video.play().catch(error=>{aborted=true;stop();status(error.message,true);});}
        draw(Math.min(time,total-.001));
        if(time>=total){time=total;stop();$('#edit-time').textContent=`${total.toFixed(2)} / ${total.toFixed(2)} с`;return;}raf=requestAnimationFrame(tick);
      }catch(error){aborted=true;stop();status(error.message,true);}
    }
    raf=requestAnimationFrame(tick);
  }
  $('#edit-upload').onclick=()=>$('#edit-files').click();$('#edit-files').onchange=e=>importFiles([...e.target.files]);
  for(const target of [$('#edit-bin'),$('#edit-track')]){target.ondragover=e=>e.preventDefault();target.ondrop=e=>{e.preventDefault();drop(e);};}
  $('#edit-play').onclick=async()=>{if(playing){stop();return;}if(time>=total-.02)time=0;try{await start();}catch(error){stop();status(error.message,true);}};
  $('#edit-scrub').oninput=e=>{stop();preview(Number(e.target.value));};
  $('#edit-trim').onclick=()=>{const c=current();if(!c)return;const before={in:c.in,out:c.out,transition:c.transition,fade:c.fade,muted:c.muted};c.in=Number($('#edit-in').value);c.out=Number($('#edit-out').value);c.transition=$('#edit-transition').value;c.fade=Math.min(2,Math.max(.1,Number($('#edit-fade').value)||.5));c.muted=$('#edit-muted').checked;try{C.schedule(clips);refresh();preview(plan.find(p=>p.id===c.id).start);status('Настройки применены. Исходный файл сохранён.');}catch(error){Object.assign(c,before);status(error.message,true);}};
  for(const id of ['edit-transition','edit-fade','edit-muted'])$('#'+id).onchange=()=>{const c=current();if(!c)return;c.transition=$('#edit-transition').value;c.fade=Math.min(2,Math.max(.1,Number($('#edit-fade').value)||.5));c.muted=$('#edit-muted').checked;refresh();preview(time);};
  $('#edit-fade').oninput=()=>{const c=current(),value=Number($('#edit-fade').value);if(!c||!Number.isFinite(value)||value<.1||value>2)return;c.fade=value;refresh(true);preview(time);};
  $('#edit-remove').onclick=()=>{const c=current();if(!c)return;c.video.pause();c.source?.disconnect();c.gain?.disconnect();c.video.removeAttribute('src');c.video.load();clips=clips.filter(x=>x!==c);selected=clips[0]?.id||null;refresh();preview(0);};
  $('#edit-format').onchange=()=>{const [w,h]={portrait:[720,1280],landscape:[1280,720],square:[1080,1080]}[$('#edit-format').value];canvas.width=w;canvas.height=h;canvas.style.aspectRatio=`${w}/${h}`;draw(time);};
  $('#edit-cancel').onclick=()=>{aborted=true;stop();status('Экспорт отменён. Монтаж остался на дорожке.');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){if(exporting){aborted=true;status('Экспорт отменён: вкладка была скрыта. Запусти снова и держи её открытой.',true);}stop();}});
  $('#edit-export').onclick=async()=>{
    if(exporting||playing||!clips.length)return;
    if(!window.MediaRecorder||!canvas.captureStream){status('В этом браузере нет записи видео. Открой страницу в актуальном Chrome или Edge.',true);return;}
    const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
    if(!mime){status('Браузер не поддерживает доступные форматы экспорта.',true);return;}
    const savedTime=time;let stream=null,timeout=null;exporting=true;aborted=false;lock();status('Подготовка экспорта…');
    try{
      await audioSetup();time=0;silence();await Promise.all(plan.map(c=>seek(c.video,c.in)));draw(0);if(aborted)return;
      stream=canvas.captureStream(30);for(const track of mix.stream.getAudioTracks())stream.addTrack(track.clone());
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});const chunks=[];
      const complete=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('Ошибка записи видео. Попробуй сократить сборку.'));});
      recorder.start(500);status('Экспорт идёт. Держи вкладку открытой…');
      timeout=setTimeout(()=>{aborted=true;stop();status('Экспорт остановлен: превышено время ожидания.',true);},(total+30)*1000);
      try{await start();}catch(error){aborted=true;stop();throw error;}
      await complete;if(aborted)return;
      const blob=new Blob(chunks,{type:recorder.mimeType||mime});if(!blob.size)throw Error('Получился пустой файл. Повтори экспорт.');
      const url=URL.createObjectURL(blob),a=E('a');a.href=url;a.download=`Magic-edit-${Date.now()}.${mime.startsWith('video/mp4')?'mp4':'webm'}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Готово — сборка скачана.');
    }catch(error){aborted=true;status(error.message,true);}finally{clearTimeout(timeout);stop();recorder=null;stream?.getTracks().forEach(t=>t.stop());exporting=false;lock();await preview(savedTime);}
  };
  window.addEventListener('beforeunload',e=>{if(clips.length){e.preventDefault();e.returnValue='';}});
  refresh();draw(0);
})();
