'use strict';
window.MagicPortraits = (() => {
  const jobs=new Map(), S=Studio;
  const key=()=>`magic.portraits.${S.current().uid}.${S.apiGatewayBase()}`;
  const load=()=>S.read(key(),{groups:[],assets:{},pending:null});
  const save=value=>S.write(key(),value);
  const E=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const field=(text,input)=>{const el=E('label',text);el.append(input);return el;};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  async function fingerprint(item){
    const stored=await MagicLocal.get(S.current().uid,item.id);
    if(stored?.file){const hash=await crypto.subtle.digest('SHA-256',await stored.file.arrayBuffer());return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
    if(/^https:\/\//.test(item.url||''))return item.url;
    throw new Error('Добавь фото повторно: локальный файл недоступен.');
  }
  async function prepare(item,onProgress=()=>{}){
    if(!S.apiGatewayBase())throw new Error('Для портретов подключи Worker URL в My settings.');
    const group=load().groups.find(g=>g.id===item.portraitGroupId);
    if(!group)throw new Error('Нажми «Портрет» и подключи группу в этом браузере.');
    const hash=await fingerprint(item),cacheKey=group.id+'|'+hash;
    if(jobs.has(cacheKey))return jobs.get(cacheKey);
    const job=(async()=>{
      let registered=load().assets[cacheKey];
      if(registered?.unknown)throw new Error('Предыдущая регистрация фото не подтверждена. Найди фото в BytePlus → My assets и укажи его Asset ID в окне «Портрет». Автоматический повтор CreateAsset остановлен.');
      if(!registered){
        onProgress('Загрузка фото для регистрации…');
        let url=item.url,fileToken;
        if(!/^https:\/\//.test(url||'')){
          const stored=await MagicLocal.get(S.current().uid,item.id),file=stored?.file;
          if(!file)throw new Error('Добавь локальное фото повторно.');
          if(file.size>=30*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Для портрета выбери JPG, PNG или WebP меньше 30 МБ.');
          const uploaded=await S.portraitUpload(file);url=uploaded.url;fileToken=uploaded.fileToken;
        }
        // A lost create response is ambiguous; do not auto-create a duplicate on the next click.
        let state=load();state.assets[cacheKey]={unknown:true};save(state);
        try{registered=await S.portraitApi('assets/create',{groupToken:group.token,url,fileToken,name:item.name});}
        catch(e){if(e.httpStatus>=400&&e.httpStatus<500){state=load();delete state.assets[cacheKey];save(state);}throw e;}
        state=load();state.assets[cacheKey]=registered;save(state);
      }
      const until=Date.now()+180000;
      while(true){
        onProgress('Проверка портрета в BytePlus…');
        const status=await S.portraitApi('assets/status',{assetToken:registered.token});
        if(status.status==='Active')return {...item,referenceUrl:'asset://'+registered.id,assetToken:registered.token};
        if(status.status==='Failed')throw new Error('BytePlus отклонил портрет: '+(typeof status.error==='string'?status.error:JSON.stringify(status.error||'фото не прошло обработку. Проверь группу и My assets в BytePlus.')));
        if(Date.now()>=until)throw new Error('Фото ещё обрабатывается BytePlus. Его Asset ID сохранён; нажми «Проверить фото» позже, повторной загрузки не будет.');
        await delay(5000);
      }
    })();jobs.set(cacheKey,job);try{return await job;}finally{jobs.delete(cacheKey);}
  }
  function groupSaved(group,name){const state=load();group.name=name||group.name||group.id;state.groups=state.groups.filter(g=>g.id!==group.id);state.groups.push(group);save(state);return group;}
  function manage(item,onChange){
    const dialog=E('dialog',undefined,'studio-dialog portrait-dialog'),header=E('header'),form=E('div',undefined,'stack');
    header.append(E('h2','Портрет · '+item.name));const close=E('button','×','icon-button');close.onclick=()=>dialog.close();header.append(close);dialog.append(header,form);
    const intro=E('p','Для реального человека нужна его проверка через BytePlus. Для вымышленного AI-персонажа выбери виртуальную группу. Новые фото одного персонажа добавляй в ту же группу.','panel-note');
    const setup=E('p','Проверка подключения…','panel-note'),select=E('select'),name=E('input');name.placeholder='Имя человека или AI-персонажа';name.maxLength=64;
    const error=E('p','','form-error');error.setAttribute('role','alert');const actions=E('div',undefined,'portrait-actions');
    const virtual=E('button','Новый AI-персонаж','ui-button'),real=E('button','Проверить реального человека','ui-button'),finish=E('button','Проверить результат','ui-button');
    const h5=E('a','Открыть проверку BytePlus','ui-button');h5.target='_blank';h5.rel='noopener noreferrer';h5.hidden=true;
    const apply=E('button','Привязать группу к фото','ui-button primary'),check=E('button','Зарегистрировать / проверить фото','ui-button');
    const useRaw=E('button','Использовать фото напрямую','ui-button ghost');
    const hint=E('p','Библиотека требует доступа BytePlus к Advanced Creation Rights и Assets API. Реальная группа принимает только фото проверенного человека с одним лицом. Для разных людей нужны разные группы.','panel-note');
    const docs=E('a','Инструкция по подключению портретов');docs.href='PORTRAITS_RU.md';docs.target='_blank';docs.rel='noopener';
    const render=()=>{select.replaceChildren(new Option('Выбери группу',''));for(const g of load().groups)select.add(new Option(`${g.name} · ${g.type==='AIGC'?'AI':'проверенный человек'}`,g.id));select.value=item.portraitGroupId||'';finish.disabled=!load().pending;};
    const run=async fn=>{error.textContent='';const buttons=[...dialog.querySelectorAll('button')].filter(b=>b!==close);buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){error.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);finish.disabled=!load().pending;}};
    virtual.onclick=()=>run(async()=>{if(!name.value.trim())throw new Error('Введи имя вымышленного персонажа.');const g=groupSaved(await S.portraitApi('groups/create',{name:name.value.trim(),type:'AIGC'}));render();select.value=g.id;});
    real.onclick=()=>{
      if(!name.value.trim()){error.textContent='Введи имя человека.';return;}
      const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
      run(async()=>{try{const session=await S.portraitApi('verify/start',{}),state=load();state.pending={...session,name:name.value.trim(),createdAt:Date.now()};save(state);h5.href=session.h5Link;h5.hidden=false;finish.disabled=false;if(popup)popup.location.replace(session.h5Link);}catch(e){popup?.close();throw e;}});
    };
    finish.onclick=()=>run(async()=>{const pending=load().pending;if(!pending)throw new Error('Начни проверку человека.');const result=await S.portraitApi('verify/finish',{sessionToken:pending.sessionToken}),g=groupSaved(result,pending.name),state=load();state.pending=null;save(state);render();select.value=g.id;h5.hidden=true;setup.textContent='Человек проверен. Привяжи его группу к фото.';});
    const assign=async()=>{if(!select.value)throw new Error('Выбери группу.');item=await S.setPortraitGroup(item,select.value);onChange(item);};
    apply.onclick=()=>run(async()=>{await assign();setup.textContent='Группа сохранена. При Generate фото пройдёт регистрацию перед отправкой задачи.';});
    check.onclick=()=>run(async()=>{await assign();const ready=await prepare(item,text=>setup.textContent=text);setup.textContent='Фото готово: '+ready.referenceUrl;});
    useRaw.onclick=()=>run(async()=>{item=await S.setPortraitGroup(item,null);onChange(item);dialog.close();});
    actions.append(virtual,real,finish,h5);form.append(intro,setup,field('Группа для этого фото',select),field('Новый персонаж',name),actions,hint,apply,check);
    if(S.isAdmin()){
      const existing=E('input');existing.placeholder='group-…';const connect=E('button','Подключить группу из консоли BytePlus','ui-button');connect.onclick=()=>run(async()=>{const g=groupSaved(await S.portraitApi('groups/connect',{id:existing.value.trim()}));render();select.value=g.id;});form.append(field('Существующая группа (суперадмин)',existing),connect);
    }
    const existingAsset=E('input');existingAsset.placeholder='asset-…';const connectAsset=E('button','Подключить уже зарегистрированное фото','ui-button');
    connectAsset.onclick=()=>run(async()=>{await assign();const group=load().groups.find(g=>g.id===select.value),registered=await S.portraitApi('assets/connect',{groupToken:group.token,id:existingAsset.value.trim().replace(/^asset:\/\//,'')}),state=load();state.assets[group.id+'|'+await fingerprint(item)]=registered;save(state);setup.textContent='Asset ID сохранён. При Generate будет проверен статус Active.';});
    form.append(field('Asset ID именно этого фото из выбранной группы',existingAsset),connectAsset,useRaw,docs,error);
    document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();render();
    const pending=load().pending;if(pending){h5.href=pending.h5Link;h5.hidden=false;}
    S.portraitApi('config',{}).then(config=>{setup.textContent=config.ready?(config.localUploads?'Assets API подключён; локальные фото поддерживаются.':'Assets API подключён. Пока используй HTTPS-фото или подключи PORTRAIT_FILES в Worker.'):'Добавь AK/SK в secrets Worker и активируй права библиотеки BytePlus.';}).catch(e=>setup.textContent=e.message);
    return dialog;
  }
  return {ensure:prepare,manage};
})();
