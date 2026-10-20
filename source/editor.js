'use strict';
(async()=>{
  if(document.body.dataset.page!=='editor')return;
  const S=Studio,C=MagicEditor,W=MagicCaptions,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],E=S.element;
  await S.ready();if(!await S.requireUser())return;
  for(const a of $$('.app-sidebar a')){a.title=a.textContent.trim();a.setAttribute('aria-label',a.title);}
  const page=$('.editor-page'),canvas=$('#edit-canvas'),ctx=canvas.getContext('2d'),layer=document.createElement('canvas'),lc=layer.getContext('2d'),nodes=new Map(),pendingNodes=new Map();
  let media=[],clips=[],audios=[],cues=[],titles=[],plan=[],aplan=[],selected=null,time=0,total=0,px=65,playing=false,busy='',raf=0,clock=0,recorder=null,aborted=false,audio=null,mix=null,seekVersion=0,worker=null,job=0,fetchController=null,micRecorder=null,micStream=null,micTimer=null,micDiscard=false,recordVersion=0,importRole='media',format='portrait',background='#000000',captionStyle={style:'classic',size:5,position:'bottom'},history=[],future=[];
  const id=()=>crypto.randomUUID(),assetOf=c=>media.find(m=>m.id===c.mediaId),itemOf=(kind,key)=>({video:clips,audio:audios,word:cues,title:titles}[kind]||[]).find(c=>c.id===key),current=()=>selected?itemOf(selected.kind,selected.id):null;
  const status=(text,error=false)=>{$('#edit-status').textContent=text;$('#edit-status').title=text;$('#edit-status').classList.toggle('error',error);};
  const fmt=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
  const snapshot=()=>JSON.stringify({clips,audios,cues,titles,format,background,captionStyle});
  function restore(s){const data=JSON.parse(s);({clips,audios,cues,titles,format,background,captionStyle}=data);selected=null;refresh();preview(time);}
  function change(fn,{timing=false}={}){
    if(busy||playing)return false;const before=snapshot();
    try{fn();C.schedule(clips);C.audioPlan(audios);history.push(before);if(history.length>40)history.shift();future=[];refresh();preview(time);if(timing&&cues.length)status('Монтаж изменён. Проверь таймкоды субтитров или запусти автосубтитры заново.');return true;}
    catch(error){restore(before);status(error.message,true);return false;}
  }
  function tool(key){$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===key));$$('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==key);}
  function lock(){
    page.classList.toggle('is-busy',!!busy||playing);
    page.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=!!busy||playing);
    $('#edit-play').disabled=!!busy||!total;$('#edit-play').textContent=playing?'❚❚':'▶';
    $('#edit-scrub').disabled=!!busy||!total;$('#edit-export').disabled=!!busy||playing||!total;
    $('#edit-cancel').hidden=!busy||busy==='record';$('#edit-cancel').disabled=false;
    $('#edit-voice-stop').hidden=busy!=='record';$('#edit-voice-stop').disabled=false;
    $('#edit-progress').hidden=!['export','transcribe','import'].includes(busy);
    $('#edit-undo').disabled=!!busy||playing||!history.length;$('#edit-redo').disabled=!!busy||playing||!future.length;
  }
  function sizeCanvas(){const [w,h]={portrait:[720,1280],landscape:[1280,720],square:[1080,1080]}[format];if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}canvas.style.aspectRatio=`${w}/${h}`;$('#edit-preview-format').textContent={portrait:'9:16',landscape:'16:9',square:'1:1'}[format];$('#edit-format').value=format;$('#edit-background').value=background;}
  function refresh(){
    plan=C.schedule(clips);aplan=C.audioPlan(audios);total=Math.max(0,plan.at(-1)?.end||0,...aplan.map(c=>c.end));time=Math.min(time,Math.max(0,total-.001));
    $('#edit-count').textContent=`${clips.length} видео · ${audios.length} аудио · ${fmt(total)}`;$('#edit-scrub').max=total;$('#edit-preview-empty').hidden=!!total;
    sizeCanvas();renderTimeline();inspect();renderTitles();lock();
    $('#edit-caption-style').value=captionStyle.style;$('#edit-caption-size').value=captionStyle.size;$('#edit-caption-position').value=captionStyle.position;
  }
  function inspect(){
    const c=current();$('#edit-inspector').hidden=selected?.kind!=='video'||!c;$('#edit-select-hint').hidden=selected?.kind==='video'&&!!c;$('#edit-audio-inspector').hidden=selected?.kind!=='audio'||!c;$('#edit-word-inspector').hidden=selected?.kind!=='word'||!c;
    if(!c)return;
    if(selected.kind==='video'){
      $('#edit-selected').textContent=c.name;for(const [key,value] of Object.entries({in:c.in.toFixed(3),out:c.out.toFixed(3),speed:c.speed||1,fit:c.fit||'contain',rotate:c.rotate||0,volume:Math.round((c.volume??1)*100),transition:c.transition,fade:c.fade}))$('#edit-'+key).value=value;
      for(const key of ['muted','hidden','flip'])$('#edit-'+key).checked=!!c[key];
    }else if(selected.kind==='audio'){
      $('#edit-audio-name').textContent=(c.lane==='voice'?'Голос · ':'Музыка · ')+c.name;
      for(const [key,value] of Object.entries({offset:c.offset.toFixed(3),in:c.in.toFixed(3),out:c.out.toFixed(3),volume:Math.round(c.volume*100),fadein:c.fadeIn,fadeout:c.fadeOut}))$('#edit-audio-'+key).value=value;$('#edit-audio-muted').checked=c.muted;
    }else if(selected.kind==='word'){$('#edit-word-text').value=c.text;$('#edit-word-in').value=c.start.toFixed(3);$('#edit-word-out').value=c.end.toFixed(3);}
  }
  function choose(kind,key){if(busy||playing)return;selected={kind,id:key};tool(kind==='video'?'video':kind==='audio'?'audio':kind==='word'?'captions':'text');$$('.editor-block').forEach(el=>el.classList.toggle('selected',el.dataset.kind===kind&&el.dataset.id===key));inspect();}
  function handle(block,side){const h=E('span',undefined,'editor-trim-handle '+side);h.dataset.edge=side;block.append(h);}
  function block(kind,c,start,end,label,cls){
    const b=E('div',undefined,'editor-block '+cls+(selected?.id===c.id?' selected':''));b.style.left=start*px+'px';b.style.width=Math.max(9,(end-start)*px)+'px';b.dataset.id=c.id;b.dataset.kind=kind;b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label',label);b.title=`${label} · ${fmt(start)}–${fmt(end)}`;b.append(E('span',label,'editor-block-label'));
    b.onclick=()=>choose(kind,c.id);b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose(kind,c.id);}};b.onpointerdown=e=>dragBlock(e,b,kind,c,start,end);if(kind!=='title'){handle(b,'left');handle(b,'right');}return b;
  }
  function renderTimeline(){
    const span=Math.max(12,total+4),width=span*px;$('#edit-timeline').style.width=width+94+'px';
    const ruler=$('#edit-ruler');ruler.replaceChildren();for(let t=0;t<span;t+=px<40?5:2){const mark=E('span',fmt(t).split('.')[0]);mark.style.left=t*px+'px';ruler.append(mark);}
    for(const el of $$('.editor-lane-body')){el.replaceChildren();el.style.backgroundSize=px+'px 100%';}
    for(const c of plan){const b=block('video',c,c.start,c.end,`${c.name}${c.muted?' · 🔇':''}${c.hidden?' · ▧ off':''}${c.speed!==1?' · '+c.speed+'×':''}`,'editor-video-block');const a=assetOf(c);if(a?.thumbs?.length)b.style.backgroundImage=a.thumbs.map(src=>`url("${src}")`).join(',');if(a?.thumbs?.length)b.style.backgroundImage=`url("${a.strip||a.thumbs[0]}")`;$('#edit-track').append(b);}
    for(const lane of ['music','voice']){const ends=[];for(const c of aplan.filter(c=>c.lane===lane).sort((a,b)=>a.start-b.start)){let row=ends.findIndex(end=>end<=c.start);if(row<0)row=ends.length;ends[row]=c.end;const b=block('audio',c,c.start,c.end,`${c.name}${c.muted?' · 🔇':''}`,'editor-'+c.lane+'-block');b.style.top=4+row*40+'px';b.style.height='34px';const a=assetOf(c);if(a?.wave){const img=E('img',undefined,'editor-wave');img.src=a.wave;img.alt='';b.append(img);}$('#edit-'+lane+'-track').append(b);}$('#edit-'+lane+'-track').style.height=Math.max(44,ends.length*40+4)+'px';}
    for(const c of cues){if(c.start>=total)continue;$('#edit-words').append(block('word',c,c.start,Math.min(c.end,total),c.text,'editor-word-block'));}
    for(const c of titles)$('#edit-title-track').append(block('title',c,c.start,c.end,c.text,'editor-title-block'));
    if(!clips.length)$('#edit-track').append(E('span','Перетащи видео сюда','editor-track-empty'));
    if(!cues.length)$('#edit-words').append(E('span','Автосубтитры или ручной текст →','editor-track-empty'));
    drawPlayhead();
  }
  function drawPlayhead(){$('#edit-playhead').style.left=94+time*px+'px';$('#edit-scrub').value=time;$('#edit-time').textContent=`${fmt(time)} / ${fmt(total)}`;}
  function dragBlock(event,b,kind,item,start,end){
    if(busy||playing||event.button!==0)return;event.preventDefault();choose(kind,item.id);b.setPointerCapture(event.pointerId);
    const x=event.clientX,edge=event.target.dataset.edge,origin={...item};let delta=0;
    const move=e=>{delta=(e.clientX-x)/px;const left=edge==='right'?start:Math.max(0,start+delta),right=edge==='left'?end:Math.max(left+.02,end+delta);b.style.left=left*px+'px';b.style.width=Math.max(9,(right-left)*px)+'px';};
    const up=()=>{b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);b.removeEventListener('pointercancel',cancel);if(Math.abs(delta)<.015){renderTimeline();return;}
      change(()=>{
        if(kind==='video'){const c=itemOf(kind,item.id);if(edge){const speed=c.speed||1;if(edge==='left')c.in=Math.max(0,Math.min(c.out-.1,c.in+delta*speed));else c.out=Math.min(c.duration,Math.max(c.in+.1,c.out+delta*speed));}else{const from=clips.findIndex(v=>v.id===c.id),at=Math.max(0,start+delta+(end-start)/2),others=plan.filter(v=>v.id!==c.id);let to=others.findIndex(v=>at<(v.start+v.end)/2);if(to<0)to=others.length;clips=C.move(clips,from,to);}}
        else if(kind==='audio'){const c=itemOf(kind,item.id);if(edge==='left'){const shift=Math.max(-c.in,Math.min(c.out-c.in-.1,delta));c.in+=shift;c.offset=Math.max(0,c.offset+shift);}else if(edge==='right')c.out=Math.min(c.duration,Math.max(c.in+.1,c.out+delta));else c.offset=Math.max(0,Math.min(300-(c.out-c.in),c.offset+delta));}
        else if(kind==='word'){const c=itemOf(kind,item.id);if(edge==='left')c.start=Math.max(0,Math.min(c.end-.02,c.start+delta));else if(edge==='right')c.end=Math.min(total,Math.max(c.start+.02,c.end+delta));else{const shift=Math.max(-c.start,Math.min(total-c.end,delta));c.start+=shift;c.end+=shift;}cues.sort((a,b)=>a.start-b.start);W.validate(cues,total);}
        else{const c=itemOf(kind,item.id),shift=Math.max(-c.start,Math.min(total-c.end,delta));c.start+=shift;c.end+=shift;}
      },{timing:kind==='video'});
    };
    const cancel=()=>{Object.assign(item,origin);renderTimeline();b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);b.removeEventListener('pointercancel',cancel);};
    b.addEventListener('pointermove',move);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',cancel);
  }
  function loaded(el){return new Promise((resolve,reject)=>{const finish=fn=>{clearTimeout(timer);el.removeEventListener('loadeddata',ok);el.removeEventListener('error',bad);fn();},ok=()=>finish(resolve),bad=()=>finish(()=>reject(Error('Не удалось открыть файл. Попробуй MP4 H.264 / AAC, WebM, MP3 или WAV.'))),timer=setTimeout(bad,20000);el.addEventListener('loadeddata',ok);el.addEventListener('error',bad);if(el.readyState>=2)ok();else el.load();});}
  async function runtime(item){
    if(nodes.has(item.id))return nodes.get(item.id);if(pendingNodes.has(item.id))return pendingNodes.get(item.id);
    const pending=(async()=>{const a=assetOf(item);if(!a)throw Error('Исходный файл не найден.');const el=document.createElement(clips.some(c=>c.id===item.id)?'video':'audio');el.src=a.url;el.preload='auto';el.playsInline=true;await loaded(el);const node={el,source:null,gain:null};nodes.set(item.id,node);return node;})();pendingNodes.set(item.id,pending);try{return await pending;}finally{pendingNodes.delete(item.id);}
  }
  function seek(el,value){value=Math.max(0,Math.min(value,Math.max(0,el.duration-.001)));if(Math.abs(el.currentTime-value)<.005&&el.readyState>=2)return Promise.resolve();return new Promise((resolve,reject)=>{const finish=fn=>{clearTimeout(timer);el.removeEventListener('seeked',ok);el.removeEventListener('error',bad);fn();},ok=()=>finish(resolve),bad=()=>finish(()=>reject(Error('Не удалось прочитать кадр.'))),timer=setTimeout(bad,10000);el.addEventListener('seeked',ok);el.addEventListener('error',bad);el.currentTime=value;});}
  function silence(){for(const n of nodes.values()){n.el.pause();if(n.gain)n.gain.gain.value=0;}}
  function frames(at){return [...C.frame(plan,at),...C.audioFrame(aplan,at)];}
  async function audioSetup(){if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();mix=audio.createMediaStreamDestination();}await audio.resume();for(const c of [...clips,...audios]){const n=await runtime(c);if(!n.source){n.source=audio.createMediaElementSource(n.el);n.gain=audio.createGain();n.gain.gain.value=0;n.source.connect(n.gain);n.gain.connect(audio.destination);n.gain.connect(mix);}}}
  function imageFrame(c){
    const n=nodes.get(c.id);if(!n||c.hidden)return;const v=n.el;if(!v.videoWidth||v.readyState<2)return;
    const rotate=(c.rotate||0)*Math.PI/180,swap=(c.rotate||0)%180!==0,w=swap?v.videoHeight:v.videoWidth,h=swap?v.videoWidth:v.videoHeight,scale=(c.fit==='cover'?Math.max:Math.min)(canvas.width/w,canvas.height/h);
    lc.save();lc.translate(canvas.width/2,canvas.height/2);lc.rotate(rotate);lc.scale(c.flip?-scale:scale,scale);lc.drawImage(v,-v.videoWidth/2,-v.videoHeight/2);lc.restore();
  }
  function textBlock(text,position,at,{words=null,size=5,style='classic'}={}){
    const font=Math.round(canvas.width*size/100);ctx.font=`800 ${font}px Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';const tokens=words||String(text).split(/\s+/).map(text=>({text})),lines=[];let row=[],width=0;
    for(const word of tokens){const w=ctx.measureText(word.text+' ').width;if(row.length&&width+w>canvas.width*.87){lines.push({row,width});row=[];width=0;}row.push({...word,width:w});width+=w;}if(row.length)lines.push({row,width});const height=font*1.25,base=position==='top'?canvas.height*.16:position==='center'?canvas.height*.5:canvas.height*.82,y=base-(lines.length-1)*height/2;
    lines.forEach((line,i)=>{const top=y+i*height;if(style==='box'){ctx.fillStyle='#000b';ctx.fillRect((canvas.width-line.width)/2-12,top-font*.65,line.width+24,font*1.3);}let x=(canvas.width-line.width)/2;for(const word of line.row){ctx.textAlign='left';ctx.lineJoin='round';ctx.lineWidth=Math.max(2,font*.09);ctx.strokeStyle='#000';if(style!=='box')ctx.strokeText(word.text,x,top);ctx.fillStyle=style==='pop'&&at>=word.start&&at<word.end?'#c788ff':'#fff';ctx.fillText(word.text,x,top);x+=word.width;}});
  }
  function draw(at){
    ctx.globalAlpha=1;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);if(layer.width!==canvas.width||layer.height!==canvas.height){layer.width=canvas.width;layer.height=canvas.height;}
    for(const c of C.frame(plan,at)){lc.fillStyle=background;lc.fillRect(0,0,layer.width,layer.height);imageFrame(c);ctx.globalAlpha=c.alpha;ctx.drawImage(layer,0,0);}ctx.globalAlpha=1;
    for(const t of titles)if(at>=t.start&&at<t.end)textBlock(t.text,t.position,at,{size:6});const group=W.groups(cues).find(g=>at>=g.start&&at<g.end);if(group)textBlock(group.text,captionStyle.position,at,{words:group.words,size:captionStyle.size,style:captionStyle.style});drawPlayhead();if(busy==='export')$('#edit-progress').value=total?at/total:0;
  }
  async function preview(at){const version=++seekVersion;time=Math.max(0,Math.min(at,Math.max(0,total-.001)));silence();try{await Promise.all(C.frame(plan,time).map(async c=>{const n=await runtime(c);await seek(n.el,c.sourceTime);}));if(version===seekVersion&&!playing)draw(time);}catch(error){status(error.message,true);}}
  function stop(){playing=false;cancelAnimationFrame(raf);silence();if(recorder?.state==='recording')recorder.stop();lock();}
  async function start(){
    ++seekVersion;await audioSetup();silence();await Promise.all([...plan,...aplan].map(async c=>{const n=await runtime(c),source=c.in+Math.max(0,Math.min(c.length-.001,time-c.start))*(c.speed||1);await seek(n.el,source);n.el.playbackRate=c.speed||1;}));
    if(busy==='export'&&(aborted||document.hidden)){aborted=true;stop();return;}playing=true;
    for(const f of frames(time)){const n=nodes.get(f.id);n.gain.gain.value=f.muted?0:f.gain*(f.volume??1);await n.el.play();}clock=audio.currentTime;lock();
    function tick(){if(!playing)return;const now=audio.currentTime;time=Math.min(total,time+now-clock);clock=now;try{
      const active=frames(Math.min(time,total-.001)),ids=new Set(active.map(c=>c.id));for(const [key,n] of nodes)if(!ids.has(key)){n.el.pause();if(n.gain)n.gain.gain.value=0;}
      for(const f of active){const n=nodes.get(f.id);if(n.el.error)throw Error('Ошибка воспроизведения: '+f.name);n.gain.gain.value=f.muted?0:Math.max(0,f.gain*(f.volume??1));if(Math.abs(n.el.currentTime-f.sourceTime)>.2)n.el.currentTime=Math.min(f.sourceTime,n.el.duration-.001);if(n.el.paused&&time<f.end-.04)n.el.play().catch(failPlayback);}
      draw(Math.min(time,total-.001));if(time>=total){time=total;stop();drawPlayhead();return;}raf=requestAnimationFrame(tick);
    }catch(error){failPlayback(error);}}
    raf=requestAnimationFrame(tick);
  }
  function failPlayback(error){aborted=true;stop();status(error.message,true);}
  async function decode(a){if(a.buffer)return a.buffer;const context=new (window.AudioContext||window.webkitAudioContext)();try{a.buffer=await context.decodeAudioData(await a.file.arrayBuffer());return a.buffer;}finally{await context.close();}}
  function waveform(buffer){const cv=document.createElement('canvas');cv.width=300;cv.height=40;const c=cv.getContext('2d'),data=buffer.getChannelData(0);c.strokeStyle='#b5ffe1';for(let x=0;x<300;x++){let peak=0;const from=Math.floor(x*data.length/300),to=Math.floor((x+1)*data.length/300);for(let i=from;i<to;i+=Math.max(1,Math.floor((to-from)/400)))peak=Math.max(peak,Math.abs(data[i]));c.beginPath();c.moveTo(x,20-peak*19);c.lineTo(x,20+peak*19);c.stroke();}return cv.toDataURL();}
  async function thumbnails(el){const out=[],cv=document.createElement('canvas');cv.width=96;cv.height=54;const c=cv.getContext('2d');for(let i=0;i<5;i++){await seek(el,Math.min(el.duration-.01,el.duration*i/5));c.fillStyle='#000';c.fillRect(0,0,96,54);const scale=Math.min(96/el.videoWidth,54/el.videoHeight),w=el.videoWidth*scale,h=el.videoHeight*scale;c.drawImage(el,(96-w)/2,(54-h)/2,w,h);out.push(cv.toDataURL('image/jpeg',.65));}const strip=document.createElement('canvas');strip.width=480;strip.height=54;const sc=strip.getContext('2d');for(let i=0;i<out.length;i++){const img=new Image();img.src=out[i];await img.decode();sc.drawImage(img,i*96,0);}return {thumbs:out,strip:strip.toDataURL('image/jpeg',.7)};}
  function renderMedia(){const bin=$('#edit-bin');bin.replaceChildren();for(const a of media){const card=E('article',undefined,'editor-media');card.draggable=true;card.title=a.name;if(a.thumbs?.length){const img=E('img');img.src=a.thumbs[0];img.alt='';card.append(img);}else card.append(E('div','♫','editor-audio-art'));card.append(E('strong',a.name),E('small',`${fmt(a.duration)} · ${a.kind==='video'?'Видео':'Аудио'}`));const row=E('div',undefined,'editor-row');for(const role of a.kind==='video'?['video','voice']:['music','voice']){const b=E('button',{video:'＋ Видео',music:'＋ Музыка',voice:'＋ Голос'}[role],'ui-button');b.onclick=()=>addAsset(a,role);row.append(b);}card.append(row);card.ondragstart=e=>{if(busy||playing){e.preventDefault();return;}e.dataTransfer.setData('application/x-magic-media',a.id);};bin.append(card);}lock();}
  async function importFiles(files,role='media',at=time){
    if(busy||playing)return;busy='import';aborted=false;lock();status('Чтение медиа на устройстве…');const added=[];
    try{for(const file of files){if(aborted)break;if(media.length>=20)throw Error('В медиатеке максимум 20 файлов.');if(file.size>200*1024*1024)throw Error(file.name+': больше 200 МБ.');const kind=file.type.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)?'audio':'video',url=URL.createObjectURL(file),probe=document.createElement(kind);probe.src=url;probe.muted=true;probe.preload='auto';
      try{await loaded(probe);if(!Number.isFinite(probe.duration)||probe.duration<.1||probe.duration>300)throw Error('Длительность файла — от 0,1 секунды до 5 минут.');const a={id:id(),name:file.name,file,url,kind,duration:probe.duration};if(kind==='video')Object.assign(a,await thumbnails(probe));else try{a.wave=waveform(await decode(a));}catch{/* Playback may support a codec that decodeAudioData does not. */}if(aborted){URL.revokeObjectURL(url);break;}media.push(a);added.push(a);renderMedia();}
      catch(error){URL.revokeObjectURL(url);status(file.name+': '+error.message,true);}finally{probe.removeAttribute('src');probe.load();}}
      if(!aborted)status('Медиа готовы. Перетащи файл на дорожку или нажми + на карточке.');
    }catch(error){status(error.message,true);}finally{busy='';lock();$('#edit-files').value='';}
    if(role!=='media')for(const a of added){addAsset(a,role==='video'&&a.kind!=='video'?'music':role,at);at+=Math.min(a.duration,Math.max(.1,total-at));}
  }
  function addAsset(a,role,offset=time,index=clips.length){
    if(busy||playing)return;change(()=>{
      const common={id:id(),mediaId:a.id,name:a.name,duration:a.duration,in:0,out:a.duration,volume:1,muted:false};
      if(role==='video'){if(a.kind!=='video')throw Error('На видеодорожку нужен видеофайл.');clips.splice(index,0,{...common,speed:1,fit:'contain',rotate:0,flip:false,hidden:false,transition:'cut',fade:.5});selected={kind:'video',id:common.id};}
      else{if(audios.length>=20)throw Error('Максимум 20 аудиоклипов.');const start=Math.max(0,Math.min(offset,299.9)),available=total>start?total-start:300-start;audios.push({...common,out:Math.min(a.duration,available),offset:start,lane:role==='voice'?'voice':'music',fadeIn:0,fadeOut:0});selected={kind:'audio',id:common.id};}
    },{timing:role==='video'});preview(role==='video'?(plan.find(c=>c.id===selected?.id)?.start||0):offset);
  }
  function drop(e,lane){e.preventDefault();if(busy||playing)return;const at=Math.max(0,(e.clientX-e.currentTarget.getBoundingClientRect().left)/px),a=media.find(a=>a.id===e.dataTransfer.getData('application/x-magic-media'));if(a){const role=lane==='video'?'video':lane==='voice'?'voice':'music';let index=plan.findIndex(c=>at<(c.start+c.end)/2);if(index<0)index=clips.length;addAsset(a,role,at,index);}else if(e.dataTransfer.files.length)importFiles([...e.dataTransfer.files],lane==='video'?'video':lane==='voice'?'voice':'music',at);}
  function pickFiles(role,accept='video/*,audio/*'){importRole=role;$('#edit-files').accept=accept;$('#edit-files').click();}
  $$('[data-tool]').forEach(b=>b.onclick=()=>tool(b.dataset.tool));$('#edit-upload').onclick=()=>pickFiles('media');$('#edit-audio-upload').onclick=()=>pickFiles('music','audio/*');$('#edit-voice-upload').onclick=()=>pickFiles('voice','audio/*,video/*');$('#edit-files').onchange=e=>importFiles([...e.target.files],importRole);
  $('#edit-bin').ondragover=e=>e.preventDefault();$('#edit-bin').ondrop=e=>{e.preventDefault();importFiles([...e.dataTransfer.files]);};for(const [selector,lane] of [['#edit-track','video'],['#edit-music-track','music'],['#edit-voice-track','voice']]){$(selector).ondragover=e=>e.preventDefault();$(selector).ondrop=e=>drop(e,lane);}
  $('#edit-ruler').onpointerdown=e=>{if(busy)return;stop();preview((e.clientX-e.currentTarget.getBoundingClientRect().left)/px);};$('#edit-scrub').oninput=e=>{stop();preview(Number(e.target.value));};$('#edit-zoom').oninput=e=>{px=Number(e.target.value);renderTimeline();};
  $('#edit-play').onclick=async()=>{if(playing){stop();return;}if(time>=total-.03)time=0;busy='prepare';lock();try{await start();}catch(error){stop();status(error.message,true);}finally{busy='';lock();}};$('#edit-to-start').onclick=()=>preview(0);$('#edit-to-end').onclick=()=>preview(total-.001);
  $('#edit-trim').onclick=()=>{const c=current();if(selected?.kind!=='video'||!c)return;change(()=>{Object.assign(c,{in:Number($('#edit-in').value),out:Number($('#edit-out').value),speed:Number($('#edit-speed').value),fit:$('#edit-fit').value,rotate:Number($('#edit-rotate').value),volume:Math.min(2,Math.max(0,Number($('#edit-volume').value)/100)),muted:$('#edit-muted').checked,hidden:$('#edit-hidden').checked,flip:$('#edit-flip').checked,transition:$('#edit-transition').value,fade:Math.min(2,Math.max(.1,Number($('#edit-fade').value)||.5))});},{timing:true});};
  $('#edit-audio-apply').onclick=()=>{const c=current();if(selected?.kind!=='audio'||!c)return;change(()=>Object.assign(c,{in:Number($('#edit-audio-in').value),out:Number($('#edit-audio-out').value),offset:Number($('#edit-audio-offset').value),volume:Math.min(2,Math.max(0,Number($('#edit-audio-volume').value)/100)),fadeIn:Math.max(0,Math.min(30,Number($('#edit-audio-fadein').value))),fadeOut:Math.max(0,Math.min(30,Number($('#edit-audio-fadeout').value))),muted:$('#edit-audio-muted').checked}));};
  function removeSelected(){if(!selected)return;const {kind,id:key}=selected;change(()=>{if(kind==='video')clips=clips.filter(c=>c.id!==key);else if(kind==='audio')audios=audios.filter(c=>c.id!==key);else if(kind==='word')cues=cues.filter(c=>c.id!==key);else titles=titles.filter(c=>c.id!==key);selected=null;},{timing:kind==='video'});}
  for(const key of ['edit-remove','edit-audio-remove','edit-word-delete','edit-delete-selected'])$('#'+key).onclick=removeSelected;
  $('#edit-duplicate').onclick=()=>{const c=current();if(selected?.kind!=='video'||!c)return;change(()=>{const clone={...c,id:id()};clips.splice(clips.indexOf(c)+1,0,clone);selected={kind:'video',id:clone.id};},{timing:true});};
  $('#edit-split').onclick=()=>{const c=current();if(selected?.kind!=='video'||!c){status('Выбери видеоклип и поставь курсор внутри него.');return;}const p=plan.find(p=>p.id===c.id),cut=c.in+(time-p.start)*(c.speed||1);if(cut<c.in+.1||cut>c.out-.1){status('Курсор должен быть внутри выбранного клипа, минимум 0,1 с от края.',true);return;}change(()=>{const next={...c,id:id(),in:cut,transition:'cut'};c.out=cut;clips.splice(clips.indexOf(c)+1,0,next);selected={kind:'video',id:next.id};},{timing:true});};
  $('#edit-undo').onclick=()=>{if(!history.length||busy||playing)return;future.push(snapshot());restore(history.pop());status('Правка отменена.');};$('#edit-redo').onclick=()=>{if(!future.length||busy||playing)return;history.push(snapshot());restore(future.pop());status('Правка повторена.');};
  $('#edit-format').onchange=()=>change(()=>{format=$('#edit-format').value;});$('#edit-background').onchange=()=>change(()=>{background=$('#edit-background').value;});
  function renderTitles(){const box=$('#edit-titles');box.replaceChildren();for(const t of titles){const row=E('div',undefined,'editor-title-row'),b=E('button','×','ui-button');b.title='Удалить титр';b.onclick=()=>change(()=>{titles=titles.filter(v=>v.id!==t.id);});const text=E('span',`${t.text} · ${fmt(t.start)}`);text.title=t.text;row.append(text,b);box.append(row);}}
  $('#edit-title-add').onclick=()=>{const text=$('#edit-title-text').value.trim(),start=Number($('#edit-title-in').value),end=Number($('#edit-title-out').value);if(!text||!total||start<0||end<=start||end>total){status('Введи текст и интервал внутри сборки.',true);return;}change(()=>{if(titles.length>=30)throw Error('Максимум 30 титров.');titles.push({id:id(),text,start,end,position:$('#edit-title-position').value});});};
  function download(blob,name){const url=URL.createObjectURL(blob),a=E('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('#edit-caption-open').onclick=()=>tool('captions');$('#edit-word-save').onclick=()=>{const c=current();if(selected?.kind!=='word'||!c)return;change(()=>{c.text=$('#edit-word-text').value.trim();c.start=Number($('#edit-word-in').value);c.end=Number($('#edit-word-out').value);cues.sort((a,b)=>a.start-b.start);W.validate(cues,total);});};
  $('#edit-word-add').onclick=()=>{if(!total)return;change(()=>{const next=cues.find(c=>c.start>=time),end=Math.min(total,time+.5,next?.start??total);if(end<=time+.02||cues.some(c=>time>c.start&&time<c.end))throw Error('Поставь курсор в свободное место между словами.');const c={id:id(),text:'Слово',start:time,end};cues.push(c);cues.sort((a,b)=>a.start-b.start);W.validate(cues,total);selected={kind:'word',id:c.id};});inspect();};
  $('#edit-caption-draft').onclick=()=>{if(!total)return;const text=$('#edit-caption-text').value.trim();if(!text){status('Вставь текст для субтитров.',true);return;}change(()=>{cues=W.draft(text,total).map(c=>({...c,id:id()}));if(cues.length>3000)throw Error('Максимум 3000 слов.');});};
  $('#edit-captions-clear').onclick=()=>{if(cues.length)change(()=>{cues=[];selected=null;});};
  $('#edit-caption-style-apply').onclick=()=>change(()=>{captionStyle={style:$('#edit-caption-style').value,size:Math.min(10,Math.max(2,Number($('#edit-caption-size').value)||5)),position:$('#edit-caption-position').value};});
  $('#edit-srt-import').onclick=()=>$('#edit-srt-file').click();$('#edit-srt-file').onchange=async e=>{const file=e.target.files[0];if(!file||!total)return;try{if(file.size>2*1024*1024)throw Error('Субтитры больше 2 МБ.');const parsed=C.parseSubtitles(await file.text(),total);if(!parsed.length)throw Error('Не найдены SRT / VTT интервалы внутри сборки.');change(()=>{cues=parsed.map(c=>({...c,id:id()}));W.validate(cues,total);if(cues.length>3000)throw Error('Максимум 3000 слов.');});}catch(error){status(error.message,true);}finally{e.target.value='';}};
  $('#edit-srt-export').onclick=()=>{try{W.validate(cues,total);if(!cues.length)throw Error('Сначала добавь субтитры.');download(new Blob([W.serialize(cues)],{type:'application/x-subrip;charset=utf-8'}),'Magic-subtitles.srt');}catch(error){status(error.message,true);}};
  async function speechAudio(token){
    const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(total*16000)),16000),sources=[...plan,...aplan.filter(c=>c.lane==='voice')].filter(c=>!c.muted&&(c.volume??1)>0);let count=0,skipped=0;
    for(const c of sources){if(token!==job)throw Error('Отменено.');let buffer;try{buffer=await decode(assetOf(c));}catch{skipped++;continue;}const source=offline.createBufferSource(),gain=offline.createGain(),speed=c.speed||1;source.buffer=buffer;source.playbackRate.value=speed;source.connect(gain);gain.connect(offline.destination);const volume=c.volume??1,start=c.start,end=c.end,inFade=c.lane?Math.min(c.fadeIn,c.length):c.overlap||0,next=plan[c.index+1],outFade=c.lane?Math.min(c.fadeOut,c.length):next?.overlap||0;
      C.fadePoints(c.length,inFade,outFade,volume).forEach(([t,v],i)=>{if(i)gain.gain.linearRampToValueAtTime(v,start+t);else gain.gain.setValueAtTime(v,start+t);});source.start(start,c.in,Math.min(c.out-c.in,Math.max(0,buffer.duration-c.in)));count++;
    }
    if(!count)throw Error('Не найден доступный звук. Добавь войс или включи звук у видео.');const rendered=await offline.startRendering();if(skipped)status(`У ${skipped} клипов звук не прочитан. Распознаются доступные дорожки.`);const samples=rendered.getChannelData(0).slice();if(!samples.some(v=>Math.abs(v)>.0001))throw Error('В сборке не найден звук речи.');return {samples,skipped};
  }
  $('#edit-recognize').onclick=async()=>{
    if(!total||busy||playing)return;const token=++job;busy='transcribe';aborted=false;lock();$('#edit-progress').removeAttribute('value');status('Подготовка звука всей сборки на устройстве…');
    try{const {samples,skipped}=await speechAudio(token);if(token!==job)return;worker||=new Worker(new URL('assets/captions/whisper-worker.js?v=0.9.1',location.href),{type:'module'});
      worker.onmessage=({data})=>{if(data.id!==job)return;if(['status','progress'].includes(data.type))status(data.text);if(data.type==='language')status('Язык: '+data.language+' · распознаём всю сборку…');if(data.type==='error'){busy='';lock();status(data.text,true);}if(data.type==='result'){busy='';lock();const words=W.normalize(data.chunks,total).map(c=>({...c,id:id()}));if(!words.length){status('Речь не найдена. Выбери язык или добавь ручной текст.',true);return;}change(()=>{cues=words.slice(0,3000);selected=null;});status(`Готово: ${cues.length} слов на дорожке.${skipped?' Внимание: у '+skipped+' клипов звук не прочитан.':''} Проверь текст и таймкоды.`);}};
      worker.onerror=()=>{if(token!==job)return;worker?.terminate();worker=null;busy='';lock();status('Whisper не запустился. Проверь интернет для загрузки модели; доступны ручные субтитры.',true);};worker.postMessage({id:token,audio:samples,language:$('#edit-language').value},[samples.buffer]);
    }catch(error){if(token===job){busy='';lock();status(error.message,true);}}
  };
  $('#edit-import-url').onclick=async()=>{
    const raw=$('#edit-url').value.trim();if(C.isYouTube(raw)){status('YouTube отдаёт плеер, а не доступный браузеру файл для монтажа. Загрузи видеофайл с устройства или вставь прямую ссылку на MP4 / WebM.',true);return;}let url;try{url=new URL(raw);if(!['https:','http:'].includes(url.protocol))throw Error();}catch{status('Вставь прямую HTTP(S) ссылку на видео или аудио.',true);return;}
    busy='import';aborted=false;lock();fetchController=new AbortController();const timeout=setTimeout(()=>fetchController?.abort(),90000);status('Скачивание медиа по прямой ссылке…');
    try{const response=await fetch(url,{mode:'cors',credentials:'omit',signal:fetchController.signal});if(!response.ok)throw Error('Источник вернул HTTP '+response.status);if(C.isYouTube(response.url))throw Error('Нужна прямая ссылка на медиафайл.');if(Number(response.headers.get('Content-Length'))>200*1024*1024)throw Error('Файл больше 200 МБ.');const reader=response.body.getReader(),parts=[];let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>200*1024*1024){await reader.cancel();throw Error('Файл больше 200 МБ.');}parts.push(value);}const name=decodeURIComponent(url.pathname.split('/').pop()||'media'),file=new File(parts,name,{type:response.headers.get('Content-Type')||''});if(aborted)return;busy='';await importFiles([file]);}
    catch(error){status(aborted?'Загрузка отменена.':'Не удалось скачать файл: '+error.message+'. Источник должен разрешать CORS; можно загрузить файл с устройства.',!aborted);}finally{clearTimeout(timeout);fetchController=null;busy='';lock();}
  };
  $('#edit-voice-record').onclick=async()=>{
    if(busy||playing)return;if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Запись микрофона недоступна в этом браузере. Загрузи готовый войс.',true);return;}busy='record';micDiscard=false;const token=++recordVersion;lock();
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==recordVersion||micDiscard){stream.getTracks().forEach(t=>t.stop());return;}micStream=stream;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m));micRecorder=new MediaRecorder(micStream,mime?{mimeType:mime}:undefined);const chunks=[];micRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};micRecorder.onstop=async()=>{clearTimeout(micTimer);micStream?.getTracks().forEach(t=>t.stop());micStream=null;busy='';lock();if(!chunks.length)status('Запись пустая. Запиши хотя бы секунду.',true);if(!micDiscard&&chunks.length){busy='import';aborted=false;lock();status('Подготовка записанного голоса…');try{const type=micRecorder.mimeType||'audio/webm',recorded=new File(chunks,'voice',{type}),buffer=await decode({file:recorded}),file=new File([C.wavePCM(buffer)],'Voice-'+Date.now()+'.wav',{type:'audio/wav'});if(aborted)return;busy='';await importFiles([file],'voice',time);}catch(error){status('Не удалось прочитать запись: '+error.message,true);}finally{busy='';lock();}}};micRecorder.onerror=()=>{micDiscard=true;if(micRecorder.state==='recording')micRecorder.stop();status('Ошибка записи микрофона.',true);};micRecorder.start(500);micTimer=setTimeout(()=>micRecorder?.state==='recording'&&micRecorder.stop(),300000);status('Микрофон записывает. Нажми «Завершить запись».');}
    catch(error){if(token!==recordVersion)return;micStream?.getTracks().forEach(t=>t.stop());micStream=null;busy='';lock();status('Микрофон недоступен: '+error.message,true);}
  };$('#edit-voice-stop').onclick=()=>{if(micRecorder?.state==='recording')micRecorder.stop();else{++recordVersion;micDiscard=true;busy='';lock();}};
  function cancel(){aborted=true;if(busy==='export')stop();else if(busy==='import'){fetchController?.abort();}else{++job;worker?.terminate();worker=null;busy='';lock();}status('Операция отменена. Монтаж сохранён в этой вкладке.');}
  $('#edit-cancel').onclick=cancel;
  $('#edit-export').onclick=async()=>{
    if(busy||playing||!total)return;if(!window.MediaRecorder||!canvas.captureStream){status('Запись видео недоступна. Попробуй актуальный Chrome или Edge.',true);return;}const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime){status('Нет поддерживаемого формата экспорта.',true);return;}
    const savedTime=time;let stream=null,timeout=null;busy='export';aborted=false;lock();status('Подготовка сборки со всеми дорожками…');
    try{await audioSetup();time=0;silence();await Promise.all(plan.map(async c=>seek((await runtime(c)).el,c.in)));draw(0);if(aborted)return;stream=canvas.captureStream(30);for(const track of mix.stream.getAudioTracks())stream.addTrack(track.clone());recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});const chunks=[],complete=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=()=>reject(Error('Ошибка записи видео. Попробуй сократить сборку.'));});recorder.start(500);status('Экспорт: держи вкладку видимой до завершения.');timeout=setTimeout(()=>{aborted=true;stop();status('Экспорт остановлен: превышено время ожидания.',true);},(total+30)*1000);try{await start();}catch(error){aborted=true;stop();throw error;}await complete;if(aborted)return;const blob=new Blob(chunks,{type:recorder.mimeType||mime});if(!blob.size)throw Error('Получился пустой файл.');download(blob,`Magic-edit-${Date.now()}.${mime.startsWith('video/mp4')?'mp4':'webm'}`);status('Готово — сборка со звуком и субтитрами скачана.');}
    catch(error){aborted=true;status(error.message,true);}finally{clearTimeout(timeout);stop();recorder=null;stream?.getTracks().forEach(t=>t.stop());busy='';lock();await preview(savedTime);}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){if(busy==='export'){aborted=true;status('Экспорт отменён: вкладка скрыта. Запусти снова и держи её видимой.',true);}stop();}});
  document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||busy)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'#edit-redo':'#edit-undo').click();}else if(e.code==='Space'){e.preventDefault();$('#edit-play').click();}else if(e.key==='Delete'){e.preventDefault();removeSelected();}});
  window.addEventListener('beforeunload',e=>{if(clips.length||audios.length||busy){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',()=>{++recordVersion;micDiscard=true;micStream?.getTracks().forEach(t=>t.stop());clearTimeout(micTimer);});
  refresh();draw(0);
})();
