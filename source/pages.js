'use strict';
(async()=>{
  const S=Studio,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)],E=S.element,page=document.body.dataset.page;
  await S.ready();
  const allowed=['index.html','spaces.html','nodes.html','assets.html','presets.html','integrations.html','projects.html','flows.html','modifiers.html','winners.html','users.html'];
  const next=()=>{const raw=new URLSearchParams(location.search).get('next')||'index.html';return allowed.includes(raw.split('?')[0])?raw:'index.html';};
  const friendlyAuth=e=>({
    'auth/invalid-credential':'Неверный email или пароль.','auth/invalid-email':'Некорректный email.','auth/email-already-in-use':'Этот email уже зарегистрирован.','auth/weak-password':'Пароль слишком слабый. Минимум 6 символов.','auth/too-many-requests':'Слишком много попыток. Попробуй позже.'
  }[e?.code]||e?.message||String(e));
  if(page==='signin'){
    if(S.current()){location.replace(next());return;}
    let mode='signin';const form=$('#auth-form'),title=$('#auth-title'),sub=$('#auth-subtitle'),nameWrap=$('#auth-name-wrap'),submit=$('#auth-submit'),error=$('#auth-error');
    function switchMode(value){mode=value;$$('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));nameWrap.hidden=mode==='signin';$('#auth-name').required=mode==='signup';title.textContent=mode==='signin'?'Войти в Magic':'Создать аккаунт';sub.textContent=mode==='signin'?'Email + пароль. Firebase сохраняет сессию между перезапусками браузера.':'Регистрация через email. После входа появится личный workspace.';submit.textContent=mode==='signin'?'Войти':'Создать аккаунт';error.textContent='';}
    $$('[data-auth-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.authMode));$('#auth-password-toggle').onclick=()=>{const i=$('#auth-password');i.type=i.type==='password'?'text':'password';};
    form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{if(mode==='signin')await S.signIn(form.email.value,form.password.value);else await S.signUp({email:form.email.value,password:form.password.value,name:form.displayName.value});location.href=next();}catch(err){error.textContent=friendlyAuth(err);}finally{submit.disabled=false;}};switchMode('signin');return;
  }
  if(!await S.requireUser())return;S.bindShell();await S.mountProfileDrawer();const user=S.current();$$('[data-user-name]').forEach(x=>x.textContent=user.name);$$('[data-user-email]').forEach(x=>x.textContent=user.email);
  const fmtDate=v=>{const n=S.timestamp(v);return n?new Date(n).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';};
  const esc=s=>String(s??'');
  function statusLabel(s){return {completed:'READY',failed:'FAILED',queued:'QUEUED',running:'GENERATING',cancelled:'CANCELLED',submission_unknown:'ПРОВЕРЬ BYTEPLUS',processing:'GENERATING'}[String(s||'').toLowerCase()]||String(s||'').toUpperCase();}

  if(page==='dashboard'){
    const [spaces,videos,users]=await Promise.all([S.listSpaces(),S.listVideos(),S.isAdmin()?S.listUsers():Promise.resolve([user])]);
    const stats=MagicDomain.totals(videos);
    $('#dashboard-scope').textContent=S.isAdmin()?'Все генерации команды · Spaces остаются личными':'Твои генерации и личные Spaces';
    $('#stat-generations').textContent=stats.total;$('#stat-spaces').textContent=spaces.length;$('#stat-xp').textContent=stats.xp;$('#stat-completed').textContent=stats.completed;
    $('#dashboard-running').textContent=stats.running;$('#dashboard-failed').textContent=stats.failed;
    $('#dashboard-cost').textContent=stats.unknownCost===stats.total&&stats.total?'—':'$'+stats.cost.toFixed(2);
    $('#cost-note').textContent=stats.unknownCost?`Без стоимости от API: ${stats.unknownCost}`:'По данным API';
    const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}
    const counts=days.map(d=>videos.filter(v=>{const n=new Date(S.timestamp(v.createdAt));const end=new Date(d);end.setDate(end.getDate()+1);return n>=d&&n<end;}).length),max=Math.max(1,...counts);
    $('#generation-chart').replaceChildren(...days.map((d,i)=>{const col=E('div',undefined,'chart-col'),bar=E('div',undefined,'chart-bar');bar.style.height=`${Math.max(5,counts[i]/max*100)}%`;bar.title=`${counts[i]} генераций`;col.append(bar,E('small',d.toLocaleDateString('ru-RU',{weekday:'short'})));return col;}));
    const recent=$('#dashboard-recent');recent.replaceChildren();
    for(const v of videos.slice(0,6)){const row=E('a',undefined,'recent-row');row.href=v.uid===user.uid&&v.spaceId?`nodes.html?space=${encodeURIComponent(v.spaceId)}`:'assets.html';const info=E('div');info.append(E('strong',(v.prompt||'Без промпта').slice(0,72)),E('small',`${v.user||'User'} · ${fmtDate(v.createdAt)}`));row.append(info,E('span',statusLabel(v.status),'status-pill '+String(v.status||'')));recent.append(row);}
    if(!videos.length)recent.append(E('div','Создай Space и запусти первую генерацию.','empty-card'));
    $('#report-scope').textContent=S.isAdmin()?'Количество, результаты и суммы по каждому участнику. Неизвестная стоимость не считается нулём.':'Отчёт доступен только по твоему аккаунту.';
    const people=new Map(users.map(u=>[u.uid,{uid:u.uid,name:u.name||u.displayName||u.email}]));
    for(const v of videos)if(!people.has(v.uid))people.set(v.uid,{uid:v.uid,name:v.user||'User'});
    for(const person of people.values()){
      const summary=MagicDomain.totals(videos.filter(v=>v.uid===person.uid)),row=E('tr');
      for(const value of [person.name,summary.total,summary.completed,summary.failed,summary.xp])row.append(E('td',String(value)));
      const cost=E('td',summary.unknownCost===summary.total&&summary.total?'—':'$'+summary.cost.toFixed(2));
      if(summary.unknownCost)cost.append(E('small',`Нет данных: ${summary.unknownCost}`));row.append(cost);$('#report-rows').append(row);
    }
  }

  if(page==='spaces'){
    let all=[],tab='mine',loadError=null;const list=$('#spaces-list'),empty=$('#spaces-empty'),count=$('#spaces-count'),newButton=$('#new-space');
    const friendlyDbError=err=>{const code=String(err?.code||''),project=(window.MAGIC_FIREBASE_CONFIG||window.PICASSO_FIREBASE_CONFIG)?.projectId||'Firebase';if(code.includes('permission-denied'))return `Firestore (${project}) запретил доступ. Пустая база — это нормально: коллекции создаются автоматически. Нужно только опубликовать firestore.rules из проекта в Firebase → Firestore → Rules.`;if(code.includes('failed-precondition'))return 'Firestore просит индекс для этого запроса. Открой ссылку на создание индекса из Console браузера или Firebase Console.';return err?.message||String(err);};
    function render(){
      list.replaceChildren();
      const rows=all.filter(s=>s.ownerUid===user.uid);
      for(const s of rows){
        const row=E('article',undefined,'space-row');const main=E('a',undefined,'space-main');main.href=`nodes.html?space=${encodeURIComponent(s.id)}`;main.append(E('strong',s.name||'Untitled'),E('small',`${s.nodeCount||0} nodes · обновлено ${fmtDate(s.updatedAt)}`));
        const actions=E('div',undefined,'space-actions');const open=E('a','↗');open.title='Открыть';open.href=main.href;actions.append(open);
        if(s.ownerUid===user.uid){
          const rename=E('button','✎');rename.title='Переименовать';rename.onclick=async()=>{const name=prompt('Название Space',s.name||'');if(!name)return;try{await S.renameSpace(s.id,name);await reload();}catch(err){S.notify(friendlyDbError(err),'error');}};
          const dup=E('button','⧉');dup.title='Дублировать';dup.onclick=async()=>{try{const copy=await S.duplicateSpace(s.id);location.href=`nodes.html?space=${encodeURIComponent(copy.id)}`;}catch(err){S.notify(friendlyDbError(err),'error');}};
          const del=E('button','⌫');del.title='Удалить Space';del.onclick=async()=>{if(!confirm(`Удалить Space «${s.name}»? Сгенерированные видео останутся в Assets.`))return;try{await S.deleteSpace(s.id);await reload();}catch(err){S.notify(friendlyDbError(err),'error');}};
          actions.append(rename,dup,del);
        }
        row.append(main,actions);list.append(row);
      }
      count.textContent=`${rows.length} spaces`;
      empty.hidden=rows.length>0;
      if(!rows.length){empty.textContent=loadError?friendlyDbError(loadError):'Здесь пока нет Canvas. Создай первый Space.';empty.classList.toggle('error-card',Boolean(loadError));}
    }
    async function reload(){loadError=null;try{all=await S.listSpaces();}catch(err){console.error('Spaces load failed',err);all=[];loadError=err;}render();}
    function openNewSpaceDialog(){
      const dialog=E('dialog',undefined,'studio-dialog new-space-dialog');const header=E('header');header.append(E('h2','Новый Space'));const close=E('button','×','icon-button');close.type='button';close.onclick=()=>dialog.close();header.append(close);
      const form=E('form',undefined,'stack');const label=E('label','Название');const input=E('input');input.name='name';input.value='Untitled space';input.maxLength=80;input.required=true;label.append(input);const error=E('p','','form-error');const actions=E('div',undefined,'drawer-actions');const cancel=E('button','Отмена','ui-button');cancel.type='button';cancel.onclick=()=>dialog.close();const create=E('button','Создать Space','ui-button primary');create.type='submit';actions.append(cancel,create);form.append(label,error,actions);dialog.append(header,form);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
      form.onsubmit=async e=>{e.preventDefault();create.disabled=true;error.textContent='';try{const space=await S.createSpace(input.value);location.href=`nodes.html?space=${encodeURIComponent(space.id)}`;}catch(err){console.error('Space create failed',err);error.textContent=friendlyDbError(err);create.disabled=false;}};
      dialog.showModal();requestAnimationFrame(()=>{input.focus();input.select();});
    }
    $$('[data-spaces-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.spacesTab;$$('[data-spaces-tab]').forEach(x=>x.classList.toggle('active',x===b));render();});
    newButton.onclick=openNewSpaceDialog;
    render();
    await reload();
  }

  if(page==='assets'){
    let mode='videos',videos=await S.listVideos(),inputs=null;const grid=$('#assets-grid'),search=$('#asset-search'),status=$('#asset-status'),controllers=[];
    async function reload(){videos=await S.listVideos();if(mode==='inputs')inputs=await S.listInputAssets();render();}
    function videoCard(v){
      const card=E('article',undefined,'asset-card'),media=E('div',undefined,'asset-media');
      if(v.videoUrl){const video=E('video');video.src=v.videoUrl;video.controls=true;video.preload='metadata';media.append(video);}else media.append(E('div',statusLabel(v.status),'asset-placeholder '+String(v.status||'')));
      if(v.cost!=null)media.append(E('span','$'+Number(v.cost).toFixed(2),'asset-cost'));
      if(v.seconds>0)media.append(E('span',v.seconds+'s','asset-duration'));
      const body=E('div',undefined,'asset-body');body.append(E('p',(v.prompt||'Без промпта').slice(0,180)),E('small',`${v.model||'model'} · ${v.resolution||''} ${v.ratio||''}`));
      const tags=E('div',undefined,'asset-tags');tags.append(E('span',v.user||'User'),E('span',fmtDate(v.createdAt)));
      if(v.archived)tags.append(E('span','В архиве'));const actions=E('div',undefined,'asset-actions');
      if(v.videoUrl){const save=E('a','Скачать видео','ui-button small');save.href=v.videoUrl;save.target='_blank';save.rel='noopener';save.download='magic-'+v.id+'.mp4';actions.append(save);if(v.providerUrlExpiresAt)body.append(E('small',Date.now()>=v.providerUrlExpiresAt?'Ссылка провайдера могла истечь; отчёт сохранён.':'Ссылка ориентировочно до '+new Date(v.providerUrlExpiresAt).toLocaleString('ru-RU'),'asset-warning'));}
      if(v.uid===user.uid&&v.spaceId){const open=E('a','Открыть Canvas','ui-button small');open.href=`nodes.html?space=${encodeURIComponent(v.spaceId)}`;actions.append(open);}
      if(v.uid===user.uid&&!MagicDomain.terminal(v.status)&&v.requestId){const refresh=E('button','Проверить статус','ui-button small');refresh.onclick=async()=>{refresh.disabled=true;try{const fresh=await S.refreshGeneration(v);videos=videos.map(x=>x.id===fresh.id?fresh:x);render();}catch(e){S.notify(e.message,'error');}finally{refresh.disabled=false;}};actions.append(refresh);}
      if(v.uid===user.uid&&MagicDomain.terminal(v.status)&&!v.archived){const archive=E('button','В архив','ui-button small ghost');archive.onclick=async()=>{archive.disabled=true;try{await S.deleteVideo(v.id);v.archived=true;render();}catch(e){S.notify(e.message,'error');archive.disabled=false;}};actions.append(archive);}
      if(v.error||v.archiveWarning)body.append(E('small',v.error||v.archiveWarning,'asset-warning'));
      body.append(tags,actions);card.append(media,body);return card;
    }
    function inputCard(a){const card=E('article',undefined,'asset-card'),media=E('div',undefined,'asset-media'),m=E(a.kind==='video'?'video':'img');if(a.url)m.src=a.url;else media.append(E('small','Файл доступен в браузере, где был добавлен.'));m.alt=a.name||'';if(a.kind==='video'){m.controls=true;m.preload='metadata';}media.append(m);const body=E('div',undefined,'asset-body');body.append(E('p',a.name||'Media'),E('small',`${a.kind} · ${Math.round((a.size||0)/1024)} KB · ${fmtDate(a.createdAt)}`));card.append(media,body);return card;}
    function render(){
      grid.replaceChildren();const q=search.value.trim().toLowerCase();let rows;
      if(mode==='videos'){
        rows=videos.filter(v=>(S.isAdmin()||!v.archived)&&(status.value==='all'||v.status===status.value)&&(`${v.prompt||''} ${v.model||''} ${v.user||''}`).toLowerCase().includes(q));
        $('#assets-count').textContent=`${rows.length} генераций · ${S.isAdmin()?'вся команда':'только твои'}`;for(const v of rows)grid.append(videoCard(v));
      }else{rows=(inputs||[]).filter(a=>(`${a.name||''} ${a.kind||''}`).toLowerCase().includes(q));$('#assets-count').textContent=`${rows.length} личных файлов`;for(const a of rows)grid.append(inputCard(a));}
      $('#assets-empty').hidden=rows.length>0;status.hidden=mode!=='videos';
    }
    $$('[data-assets-tab]').forEach(b=>b.onclick=async()=>{mode=b.dataset.assetsTab;$$('[data-assets-tab]').forEach(x=>x.classList.toggle('active',x===b));try{if(mode==='inputs'&&!inputs)inputs=await S.listInputAssets();render();}catch(e){S.notify(e.message,'error');}});
    search.oninput=render;status.onchange=render;$('#assets-refresh').onclick=()=>reload().catch(e=>S.notify(e.message,'error'));render();
    for(const row of videos.filter(v=>v.uid===user.uid&&!MagicDomain.terminal(v.status)&&v.requestId)){
      const controller=new AbortController();controllers.push(controller);
      S.watchGeneration(row,fresh=>{const before=videos.find(v=>v.id===fresh.id);videos=videos.map(v=>v.id===fresh.id?fresh:v);if(before?.status!==fresh.status)render();},{signal:controller.signal}).catch(e=>S.notify('Отслеживание: '+e.message,'error'));
    }
    addEventListener('pagehide',()=>controllers.forEach(c=>c.abort()));
  }

  if(page==='presets'){await S.ensureTemplates();mountPresetLibrary($('#preset-library'));}

  if(page==='integrations'){
    const provider='byteplus',key=$('#byteplus-api-key'),worker=$('#byteplus-worker-url'),state=$('#byteplus-state'),connect=$('#byteplus-save'),test=$('#byteplus-test'),remove=$('#byteplus-remove'),card=$('#byteplus-card');
    const existing=await S.getIntegration(provider),localKey=await S.providerKey(provider),workerUrl=S.apiGatewayBase();
    worker.value=workerUrl;
    if(existing?.connected||localKey||workerUrl){key.value='';key.placeholder=localKey?'Ключ сохранён в этом браузере':'ARK key не нужен в Worker mode';state.textContent=workerUrl?'● Worker сохранён — нажми «Проверить»':'● Direct mode сохранён — нажми «Проверить»';state.className='integration-state ok';card.classList.add('connected');remove.hidden=false;test.hidden=false;}
    $('#byteplus-toggle').onclick=()=>{key.type=key.type==='password'?'text':'password';};
    connect.onclick=async()=>{connect.disabled=true;try{
      const apiKey=key.value.trim(),gateway=worker.value.trim();
      if(!apiKey&&!gateway)throw new Error('Вставь ARK API Key для быстрого Direct mode или Cloudflare Worker URL.');
      await S.saveIntegration(provider,{apiKey,workerUrl:gateway,label:'BytePlus ModelArk'});key.value='';
      state.textContent=gateway?'● Cloudflare Worker сохранён. Нажми «Проверить».':'● Direct browser mode сохранён. Нажми «Проверить».';state.className='integration-state ok';card.classList.add('connected');remove.hidden=false;test.hidden=false;
      S.notify(gateway?'Cloudflare Worker подключён':'ARK API Key сохранён локально для Direct mode');
    }catch(e){state.textContent='● Ошибка: '+e.message;state.className='integration-state bad';}finally{connect.disabled=false;}};
    test.onclick=async()=>{test.disabled=true;state.textContent=worker.value.trim()?'Проверяем Cloudflare Worker → BytePlus…':'Проверяем прямой запрос к BytePlus…';try{await S.testIntegration(provider);state.textContent=worker.value.trim()?'● Worker работает, BytePlus авторизация успешна':'● Direct mode работает — BytePlus API Key принят';state.className='integration-state ok';card.classList.add('connected');}catch(e){state.textContent='● Ошибка: '+e.message;state.className='integration-state bad';}finally{test.disabled=false;}};
    remove.onclick=async()=>{if(!confirm('Отключить BytePlus?'))return;await S.removeIntegration(provider);key.value='';worker.value='';state.textContent='● Не подключено — генерация недоступна';state.className='integration-state';card.classList.remove('connected');remove.hidden=test.hidden=true;};
    $$('.integration-future [data-provider-connect]').forEach(b=>b.onclick=()=>S.notify('Следующий provider подключается отдельным adapter без переделки Canvas.'));
  }

  if(page==='users'){
    if(!S.isAdmin()){$('.page-wrap').replaceChildren(E('div','Доступ только для суперадмина.','empty-card'));return;}
    async function team(){
      const list=$('#team-list');list.replaceChildren();
      for(const member of await S.listUsers()){
        const row=E('div',undefined,'team-row'),info=E('div');info.append(E('strong',member.name),E('small',member.email));
        const role=E('select');role.setAttribute('aria-label','Роль '+member.name);role.add(new Option('Пользователь','user'));role.add(new Option('Суперадмин','superuser'));role.value=member.role;role.disabled=member.uid===user.uid;
        if(role.disabled)role.title='Твоя роль суперадмина';
        role.onchange=async()=>{role.disabled=true;try{await S.updateUserRole(member.uid,role.value);member.role=role.value;S.notify('Роль обновлена');}catch(e){role.value=member.role;S.notify(e.message,'error');}finally{role.disabled=false;}};
        row.append(info,role);list.append(row);
      }
    }
    const form=$('#create-user-form');form.onsubmit=async e=>{
      e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;$('#create-user-error').textContent='';
      try{await S.createUser({email:form.elements.email.value,password:form.elements.password.value,name:form.elements.displayName.value,role:form.elements.role.value});form.reset();await team();S.notify('Пользователь создан');}
      catch(error){$('#create-user-error').textContent=friendlyAuth(error);}finally{submit.disabled=false;}
    };await team();
  }
  if(page==='winners'){
    const duration=$('#xp-seconds'),resolution=$('#xp-resolution'),refs=$('#xp-refs');
    function calculate(){
      $('#xp-result').textContent=MagicDomain.xp({seconds:duration.value,resolution:resolution.value,referenceCount:refs.value});
      $('#xp-seconds-label').textContent=duration.value+' сек.';$('#xp-refs-label').textContent=refs.value;
      $('#xp-multipliers').textContent=`T ×${Number(duration.value)/4} · Q ×${MagicDomain.resolutions[resolution.value]} · R ×${(1+.15*(Number(refs.value)-1)).toFixed(2)}`;
    }
    for(const control of [duration,resolution,refs])control.oninput=calculate;calculate();
    function renderRank(target,rows,field){
      target.replaceChildren();for(const [index,row] of rows.entries()){
        const li=E('li',undefined,'rank-row'+(index===0?' first':'')),name=E('div');name.append(E('strong',row.nickname||'User'),E('small',field==='xp'?`${row.completed||0} готовых видео`:'Ошибок генерации'));
        li.append(E('span',String(index+1),'rank-position'),name,E('b',String(row[field]||0)+(field==='xp'?' XP':'')));target.append(li);
      }
      if(!rows.length)target.append(E('li','Пока нет результатов. Рейтинг появится после генераций.','empty-card'));
    }
    async function ranking(){
      try{const rows=await S.listLeaderboard();renderRank($('#xp-ranking'),rows.filter(r=>r.completed>0).sort((a,b)=>b.xp-a.xp||(a.nickname||'').localeCompare(b.nickname||'')),'xp');renderRank($('#error-ranking'),rows.filter(r=>r.failed>0).sort((a,b)=>b.failed-a.failed||(a.nickname||'').localeCompare(b.nickname||'')),'failed');}
      catch(e){$('#xp-ranking').replaceChildren(E('li','Рейтинг пока недоступен: '+e.message,'empty-card'));$('#error-ranking').replaceChildren();}
    }
    $('#rebuild-ranking').onclick=async()=>{const button=$('#rebuild-ranking');button.disabled=true;try{await S.rebuildLeaderboard();await ranking();S.notify('Рейтинг пересчитан по истории генераций');}catch(e){S.notify(e.message,'error');}finally{button.disabled=false;}};
    await ranking();
  }

  if(page==='placeholder'){const name=document.body.dataset.module||'Module';$('#placeholder-title').textContent=name;}
})().catch(error=>{Studio.notify(error.message||String(error),'error');});
