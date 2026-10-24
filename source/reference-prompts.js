(function(root){
  'use strict';
  const attached=new Set(),states=new WeakMap();let popup=null,hideTimer=null,shown=null;
  function tokens(text,references=[]){
    const groups={image:[],video:[],audio:[]};for(const ref of references)if(ref&&groups[ref.kind])groups[ref.kind].push(ref);
    return Array.from(String(text||'').matchAll(/@(image|video|audio)_?([1-9]\d*)\b/gi),match=>({text:match[0],start:match.index,end:match.index+match[0].length,asset:groups[match[1].toLowerCase()][Number(match[2])-1]||null}));
  }
  function hide(){clearTimeout(hideTimer);if(popup){popup.hidden=true;for(const video of popup.querySelectorAll('video,audio'))video.pause();}shown=null;}
  function ensurePopup(){if(popup)return popup;popup=document.createElement('aside');popup.className='ref-prompt-preview';popup.setAttribute('role','tooltip');popup.hidden=true;document.body.append(popup);popup.onpointerenter=()=>clearTimeout(hideTimer);popup.onpointerleave=hide;return popup;}
  function show(token,x,y){
    clearTimeout(hideTimer);const box=ensurePopup(),asset=token.asset,key=token.text+'|'+(asset?.id||'missing')+'|'+(asset?.url||asset?.referenceUrl||'');
    if(shown!==key){box.replaceChildren();const title=document.createElement('strong');title.textContent=token.text;box.append(title);
      const url=asset?.url||asset?.referenceUrl;
      const local=url&&typeof location!=='undefined'&&/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(url)&&new URL(url).origin===location.origin;
      if(asset&&url&&(/^(?:https:|blob:|data:image\/)/.test(url)||local)){
        const media=document.createElement(asset.kind==='image'?'img':asset.kind==='video'?'video':'audio');media.src=url;if(asset.kind==='image')media.alt=asset.name||token.text;else{media.muted=true;media.controls=true;media.preload='metadata';if(asset.kind==='video'){media.playsInline=true;media.loop=true;media.autoplay=true;media.play().catch(()=>{});}}box.append(media);
      }
      const name=document.createElement('small');name.textContent=asset?(url?asset.name||'Референс':'Файл недоступен: добавь его повторно.'):'Этот референс не подключён к генерации.';box.append(name);shown=key;
    }
    box.hidden=false;const width=box.offsetWidth,height=box.offsetHeight;box.style.left=Math.max(8,Math.min(innerWidth-width-8,x+14))+'px';box.style.top=Math.max(8,y-height-14>=8?y-height-14:Math.min(innerHeight-height-8,y+20))+'px';
  }
  function attach(field,getReferences){
    if(!field||states.has(field))return;const parent=field.parentElement;if(getComputedStyle(parent).position==='static')parent.style.position='relative';
    const mirror=document.createElement('div');mirror.className='ref-prompt-mirror';mirror.setAttribute('aria-hidden','true');parent.append(mirror);field.classList.add('ref-prompt-input');
    const state={field,mirror,getReferences,marks:[],refresh:null,observer:null};states.set(field,state);attached.add(state);
    state.refresh=()=>{
      if(!field.isConnected)return;const cs=getComputedStyle(field);for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','textIndent','textTransform','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','wordBreak','tabSize'])mirror.style[key]=cs[key];
      mirror.style.left=field.offsetLeft+'px';mirror.style.top=field.offsetTop+'px';mirror.style.width=field.offsetWidth+'px';mirror.style.height=field.offsetHeight+'px';const gutter=Math.max(0,field.offsetWidth-field.clientWidth-parseFloat(cs.borderLeftWidth)-parseFloat(cs.borderRightWidth));mirror.style.paddingRight=(parseFloat(cs.paddingRight)+gutter)+'px';
      const text=field.value||'',parts=tokens(text,getReferences()||[]);mirror.replaceChildren();state.marks=[];let index=0;
      for(const token of parts){mirror.append(document.createTextNode(text.slice(index,token.start)));const mark=document.createElement('span');mark.className='ref-prompt-token'+(token.asset?'':' missing');mark.textContent=token.text;mirror.append(mark);state.marks.push({mark,token});index=token.end;}
      mirror.append(document.createTextNode(text.slice(index)+(text.endsWith('\n')?'\n':'')));mirror.scrollTop=field.scrollTop;mirror.scrollLeft=field.scrollLeft;
    };
    field.addEventListener('input',()=>{hide();state.refresh();});field.addEventListener('scroll',()=>{mirror.scrollTop=field.scrollTop;mirror.scrollLeft=field.scrollLeft;hide();});
    field.addEventListener('pointermove',event=>{const clip=field.getBoundingClientRect();if(event.clientX<clip.left||event.clientX>clip.right||event.clientY<clip.top||event.clientY>clip.bottom)return;for(const item of state.marks){if(Array.from(item.mark.getClientRects()).some(r=>event.clientX>=Math.max(r.left,clip.left)&&event.clientX<=Math.min(r.right,clip.right)&&event.clientY>=Math.max(r.top,clip.top)&&event.clientY<=Math.min(r.bottom,clip.bottom))){show(item.token,event.clientX,event.clientY);return;}}hide();});
    field.addEventListener('pointerleave',()=>{hideTimer=setTimeout(hide,160);});field.addEventListener('keydown',hide);field.addEventListener('blur',hide);
    if(typeof ResizeObserver!=='undefined'){state.observer=new ResizeObserver(state.refresh);state.observer.observe(field);}state.refresh();
  }
  function refresh(){for(const state of attached){if(!state.field.isConnected){state.observer?.disconnect();state.mirror.remove();attached.delete(state);}else state.refresh();}}
  root.MagicReferencePrompts={tokens,attach,refresh,hide};
  if(typeof window!=='undefined'&&typeof document!=='undefined'){window.addEventListener('resize',()=>{hide();refresh();});window.addEventListener('scroll',hide,true);}
})(typeof window==='undefined'?globalThis:window);
