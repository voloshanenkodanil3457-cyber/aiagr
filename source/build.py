from pathlib import Path
root=Path(__file__).parent
out=root.parent
css=(root/'theme.css').read_text()+'\n'+(root/'cursors.css').read_text()
canvas_css=(root/'canvas-base.css').read_text()
firebase=(root/'firebase-config.js').read_text()
app=(root/'domain.js').read_text()+'\n'+(root/'local-store.js').read_text()+'\n'+(root/'app.js').read_text()
library=(root/'library.js').read_text()
pages=(root/'pages.js').read_text()
canvas=(root/'canvas.js').read_text()

favicon='''<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect x=%273%27 y=%273%27 width=%2726%27 height=%2726%27 rx=%278%27 fill=%27%2317171b%27 stroke=%27%235a5a66%27/%3E%3Cpath d=%27M8 22V10h3.2l4.8 6.4 4.8-6.4H24v12h-3.4v-6.6L16 21l-4.6-5.6V22z%27 fill=%27white%27/%3E%3Cpath d=%27M25 5l.8 2.2L28 8l-2.2.8L25 11l-.8-2.2L22 8l2.2-.8z%27 fill=%27%238ab8ff%27/%3E%3C/svg%3E">'''

NAV=[
 ('CREATE',[('dashboard','▦','Dashboard','index.html'),('spaces','⌘','Canvas','spaces.html'),('flows','✣','Flows','flows.html'),('assets','▧','Assets','assets.html')]),
 ('ORGANIZE',[('projects','□','Projects','projects.html'),('presets','▤','Templates','presets.html'),('modifiers','☷','Modifiers','modifiers.html')]),
 ('RESULTS',[('winners','♕','Winners','winners.html')]),
 ('ACCOUNT',[('integrations','⚙','My settings','integrations.html'),('users','♙','Users','users.html')])
]

def sidebar(active):
    groups=[]
    for label,items in NAV:
        links=[]
        for key,icon,title,path in items:
            cur=(' aria-current="page"' if key==active else '')+(' data-superuser-only hidden' if key=='users' else '')
            links.append(f'<a href="{path}"{cur}><span class="nav-icon">{icon}</span><span>{title}</span></a>')
        groups.append(f'<section class="nav-group"><span class="nav-label">{label}</span><nav class="app-nav">{"".join(links)}</nav></section>')
    return f'''<aside class="app-sidebar">
      <a class="brand" href="index.html"><span class="brand-logo"></span><span class="brand-copy"><strong>Magic</strong><small>AI Ad Creatives</small></span></a>
      {''.join(groups)}
      <div class="sidebar-user"><small>USER</small><span data-user-email>—</span></div>
    </aside>'''

def drawer():
    return '''<div id="drawer-backdrop" class="drawer-backdrop"></div>
    <aside id="profile-drawer" class="profile-drawer" aria-label="Профиль">
      <div class="drawer-title"><h2>Профиль</h2><button id="profile-close" class="icon-button" aria-label="Закрыть">×</button></div>
      <div class="profile-photo"><div class="profile-photo-view"><img class="profile-photo-img" hidden alt=""><span class="profile-photo-letters">M</span></div><div class="upload-photo"><label class="ui-button">⇧ Загрузить фото<input id="profile-photo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><small>PNG / JPG / WebP, до 5 MB</small></div></div>
      <div class="profile-email"><span>Email</span><strong data-profile-email>—</strong></div>
      <form id="profile-form" class="stack"><label>ИМЯ<input name="displayName" required maxlength="80"></label><label>TELEGRAM<input name="telegram" maxlength="120" placeholder="@username"></label><div class="drawer-actions"><button type="button" class="ui-button" id="profile-cancel">Отмена</button><button class="ui-button primary" type="submit">Сохранить</button></div></form>
      <section id="drawer-admin" class="drawer-admin" hidden><h3>Суперадмин · пользователи</h3><form class="stack"><label>Email<input name="email" type="email" required></label><label>Имя<input name="name" required maxlength="80"></label><label>Временный пароль<input name="password" type="password" minlength="6" required></label><label>Роль<select name="role"><option value="user">Пользователь</option><option value="superuser">Суперадмин</option></select></label><button type="submit" class="ui-button primary">Создать пользователя</button></form><a href="users.html" class="ui-button">Управлять ролями →</a></section>
      <button data-logout class="ui-button danger ghost drawer-logout">Выйти</button>
    </aside>'''

def shell(active, canvas_mode=False):
    if canvas_mode:
        center='''<div class="topbar-breadcrumb"><a href="spaces.html">← Spaces</a><span class="slash">/</span><strong id="space-breadcrumb">Canvas</strong><span class="slash">/</span><span>📁 No project</span></div><div class="topbar-legend"><span class="legend-dot creation">Creation</span><span class="legend-dot output">Output</span><span class="legend-dot variable">Variable</span><span class="legend-dot modifier">Modifier</span></div><span id="autosave-state" class="autosave-state">Сохранено на компьютере</span>'''
        extra='<span class="share-button">Личный Space</span>'
    else:
        center='<span></span>'
        extra=''
    return sidebar(active)+f'''<header class="app-topbar">{center}<span class="topbar-spacer"></span><div class="topbar-actions"><button class="theme-button" data-theme-toggle title="Сменить тему">★ <span data-theme-state>Dark</span></button><button id="shell-avatar" class="avatar-button" data-user-avatar aria-label="Профиль">M</button>{extra}</div></header>'''+drawer()

def head(title, canvas_mode=False):
    styles=canvas_css+'\n'+css if canvas_mode else css
    return f'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Magic</title>{favicon}<style>{styles}</style></head>'

def scripts(page_scripts=True):
    js=firebase+'\n'+app+'\n'+library
    if page_scripts: js+='\n'+pages
    return '<script>'+js+'</script>'

def save(name,title,page,active,body,module=None):
    mod=f' data-module="{module}"' if module else ''
    html=head(title)+f'<body data-page="{page}"{mod}>'+shell(active)+f'<main class="app-content"><div class="page-wrap">{body}</div></main>'+scripts()+'</body></html>'
    (out/name).write_text(html)

# Sign in / registration
signin='''<main class="auth-page"><section class="auth-card"><div class="brand auth-brand"><span class="brand-logo"></span><span class="brand-copy"><strong>Magic</strong><small>AI Ad Creatives</small></span></div><h1 id="auth-title">Войти в Magic</h1><p id="auth-subtitle">Email + пароль</p><p class="auth-access-note">Аккаунт выдаёт суперадмин команды.</p><form id="auth-form" class="stack"><label id="auth-name-wrap" hidden>Имя<input id="auth-name" name="displayName" maxlength="80" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Пароль<div class="password-row"><input id="auth-password" name="password" type="password" required minlength="6" autocomplete="current-password"><button id="auth-password-toggle" type="button" class="ui-button">Показать</button></div></label><p id="auth-error" class="form-error"></p><button id="auth-submit" type="submit" class="ui-button primary">Войти</button></form></section></main>'''
(out/'signin.html').write_text(head('Sign in')+f'<body class="auth-body" data-page="signin">{signin}{scripts()}</body></html>')

# Dashboard
dashboard='''<section class="dashboard-greeting"><h1>Привет, <span data-user-name>user</span>!</h1><p id="dashboard-scope">Отчёт по генерациям</p></section><section class="stat-grid"><article class="stat-card"><span class="stat-icon">✦</span><strong id="stat-generations">0</strong><small>Генерации</small></article><article class="stat-card"><span class="stat-icon">⌘</span><strong id="stat-spaces">0</strong><small>Мои Canvas Spaces</small></article><article class="stat-card"><span class="stat-icon">▤</span><strong id="stat-xp">0</strong><small>XP за готовые видео</small></article><article class="stat-card"><span class="stat-icon">✓</span><strong id="stat-completed">0</strong><small>Готовые видео</small></article></section><section class="dashboard-grid"><article class="panel-card"><h2>Генерации · последние 7 дней</h2><div class="chart-summary"><div><small>В работе</small><strong id="dashboard-running">0</strong></div><div><small>Ошибки</small><strong id="dashboard-failed">0</strong></div><div><small>API cost</small><strong id="dashboard-cost">—</strong><small id="cost-note"></small></div></div><div id="generation-chart" class="generation-chart"></div></article><article class="panel-card"><h2>Последние генерации</h2><div id="dashboard-recent" class="recent-list"></div></article></section>'''
dashboard += '''<section class="panel-card report-panel"><h2>Отчёт по пользователям</h2><p class="muted" id="report-scope"></p><div class="table-scroll"><table class="report-table"><thead><tr><th>Ник</th><th>Генерации</th><th>Готово</th><th>Ошибки</th><th>XP</th><th>Стоимость API</th></tr></thead><tbody id="report-rows"></tbody></table></div></section>'''
save('index.html','Dashboard','dashboard','dashboard',dashboard)

# Spaces
spaces='''<section class="spaces-shell"><div class="page-titlebar"><div><h1>Canvas Spaces</h1><p>Твои личные схемы и настройки генерации</p></div><div class="right"><button id="new-space" class="ui-button primary">+ New Space</button></div></div><div style="display:flex;justify-content:flex-end;margin:-13px 0 10px"><small id="spaces-count">0 spaces</small></div><section id="spaces-list" class="spaces-list"></section><div id="spaces-empty" class="empty-card" hidden>Здесь пока нет Canvas. Создай первый Space.</div></section>'''
save('spaces.html','Canvas Spaces','spaces','spaces',spaces)

# Assets
assets='''<div class="page-titlebar"><div><h1>Assets</h1><p id="assets-count">0 generations</p></div></div><div class="assets-toolbar"><div class="segmented"><button class="active" data-assets-tab="videos">Генерации</button><button data-assets-tab="inputs">Мои медиа</button></div><input id="asset-search" type="search" placeholder="⌕  Поиск..."><select id="asset-status"><option value="all">Все статусы</option><option value="completed">Ready</option><option value="running">Generating</option><option value="queued">Queued</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select><button id="assets-refresh" class="ui-button">Обновить</button></div><section id="assets-grid" class="assets-grid"></section><div id="assets-empty" class="empty-card" hidden style="margin-top:20px">Пока нет ассетов.</div>'''
save('assets.html','Assets','assets','assets',assets)

# Templates
presets='''<div class="page-titlebar"><div><h1>Шаблоны промптов</h1><p>Insert into Canvas workflows with one click</p></div></div><section id="preset-library"></section>'''
save('presets.html','Templates','presets','presets',presets)

# Integrations
integrations='''<section class="integrations-wrap"><div class="page-titlebar"><div><p class="eyebrow">ИНТЕГРАЦИИ</p><h1>API providers</h1></div></div><p class="integration-intro">Magic поддерживает два режима BytePlus. <b>Direct browser</b> — самый быстрый тест: вставляешь длинный ARK API Key, и браузер пытается обратиться к ModelArk напрямую. <b>Cloudflare Worker</b> — режим для GitHub Pages: ARK key хранится как секрет Worker и не попадает в браузер.</p><article id="byteplus-card" class="integration-card"><div class="integration-head"><div class="provider-logo s">B</div><div class="integration-copy"><strong>BytePlus ModelArk <small>· Seedance 2.5</small></strong><span id="byteplus-state" class="integration-state">● Не подключено — генерация недоступна</span></div><div class="integration-actions"><button id="byteplus-test" class="ui-button" hidden>Проверить</button><button id="byteplus-remove" class="ui-button danger ghost" hidden>Отключить</button></div></div><div class="integration-credentials one-key"><label class="credential-field grow"><span>ARK API KEY · DIRECT TEST</span><input id="byteplus-api-key" type="password" autocomplete="off" placeholder="Необязательно, если используешь Worker"></label><button id="byteplus-toggle" class="ui-button" type="button">👁</button></div><div class="integration-credentials one-key" style="margin-top:10px"><label class="credential-field grow"><span>CLOUDFLARE WORKER URL · RECOMMENDED</span><input id="byteplus-worker-url" type="url" autocomplete="off" placeholder="https://magic-byteplus-api.your-subdomain.workers.dev"></label><button id="byteplus-save" class="ui-button primary" type="button">🔑 Подключить</button></div><p class="integration-help"><b>Для быстрого локального теста:</b> оставь Worker URL пустым и вставь ARK API Key. Если браузер покажет CORS — это ограничение BytePlus, а не ключа. <b>Для GitHub Pages:</b> задеплой папку <code>cloudflare-worker</code>, вставь полученный workers.dev URL сюда, а ARK key в Magic уже не нужен.</p></article><article class="integration-card integration-future"><div class="integration-head"><div class="provider-logo o">F</div><div class="integration-copy"><strong>fal.ai</strong><small>Provider slot · video / image models</small></div><button class="ui-button" data-provider-connect="fal">Adapter позже</button></div></article><article class="integration-card integration-future"><div class="integration-head"><div class="provider-logo o">O</div><div class="integration-copy"><strong>OpenAI / Sora</strong><small>Provider slot для будущих video models</small></div><button class="ui-button" data-provider-connect="openai">Adapter позже</button></div></article><article class="integration-card integration-future"><div class="integration-head"><div class="provider-logo c">C</div><div class="integration-copy"><strong>Custom provider</strong><small>Отдельный auth / submit / poll adapter без переделки Canvas</small></div><button class="ui-button" data-provider-connect="custom">Adapter позже</button></div></article></section>'''
save('integrations.html','Integrations','integrations','integrations',integrations)

# Placeholders
for name,title,key in [('flows.html','Flows','flows'),('projects.html','Projects','projects'),('modifiers.html','Modifiers','modifiers')]:
    body=f'''<div class="page-titlebar"><div><h1 id="placeholder-title">{title}</h1><p>Раздел заложен в универсальную структуру Magic</p></div></div><section class="placeholder-card"><h2>{title}</h2><p>Эта страница уже подключена к общей навигации, Firebase auth, профилю и теме. Бизнес-логику можно развивать отдельно, не меняя архитектуру Canvas / Assets.</p></section>'''
    save(name,title,'placeholder',key,body,title)

# Team administration and the public, aggregate-only game board.
users='''<div class="page-titlebar"><div><h1>Пользователи</h1><p>Суперадмин управляет аккаунтами и ролями команды</p></div></div><section class="team-grid"><article class="panel-card"><h2>Новый пользователь</h2><form id="create-user-form" class="stack"><label>Ник<input name="displayName" required maxlength="80"></label><label>Email<input name="email" type="email" required autocomplete="off"></label><label>Временный пароль<input name="password" type="password" required minlength="6" autocomplete="new-password"></label><label>Роль<select name="role"><option value="user">Пользователь</option><option value="superuser">Суперадмин</option></select></label><p id="create-user-error" class="form-error" role="alert"></p><button type="submit" class="ui-button primary">Создать пользователя</button></form></article><article class="panel-card"><h2>Команда</h2><div id="team-list" class="team-list"></div></article></section>'''
save('users.html','Users','users','users',users)

winners='''<div class="page-titlebar"><div><p class="eyebrow">TEAM PLAYGROUND</p><h1>Winners</h1><p>Генерируй, экспериментируй и набирай XP</p></div><div class="right"><button id="rebuild-ranking" class="ui-button" data-superuser-only hidden>Пересчитать рейтинг</button></div></div><section class="winners-grid"><article class="panel-card ranking-card"><span class="ranking-icon">♕</span><h2>Топ по генерациям</h2><p class="muted">XP за успешно созданные видео</p><ol id="xp-ranking" class="ranking-list"></ol></article><article class="panel-card ranking-card"><span class="ranking-icon error-crown">↯</span><h2>Топ по ошибкам</h2><p class="muted">Эксперименты тоже заслуживают места в истории</p><ol id="error-ranking" class="ranking-list"></ol></article></section><section class="panel-card xp-calculator"><div><p class="eyebrow">КАЛЬКУЛЯТОР</p><h2>Сколько XP принесёт видео?</h2><p class="muted">10 × длительность / 4 × разрешение × референсы</p><div class="xp-result"><output id="xp-result">49</output><span>XP за одну генерацию</span></div></div><div class="calculator-controls"><label>Длительность <output id="xp-seconds-label">10 сек.</output><input id="xp-seconds" type="range" min="4" max="30" value="10" step="1"></label><div class="range-ends"><span>4 сек.</span><span>30 сек.</span></div><label>Разрешение<select id="xp-resolution"><option value="480p">480p · ×1</option><option value="720p" selected>720p · ×1,5</option><option value="1080p">1080p · ×2</option></select></label><label>Референсы <output id="xp-refs-label">3</output><input id="xp-refs" type="range" min="1" max="15" value="3" step="1"></label><div class="range-ends"><span>1</span><span>15</span></div><small id="xp-multipliers"></small></div></section><p class="winners-note">Рейтинг показывает только ники и итоговые очки команды. Личные Spaces доступны их владельцам. Генерация без референсов получает базовый множитель ×1.</p>'''
save('winners.html','Winners','winners','winners',winners)

# Compatibility aliases from the previous prototype.
(out/'account.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=integrations.html"><title>Redirect · Magic</title><a href="integrations.html">Open settings</a>')
(out/'usage-history.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=assets.html"><title>Redirect · Magic</title><a href="assets.html">Open Assets</a>')

(out/'saved-values.html').unlink(missing_ok=True)

# Canvas: inject shell + CSS + scripts into the standalone template.
canvas_html=(root/'nodes.template.html').read_text()
canvas_html=canvas_html.replace('<!--STYLE-->',favicon+f'<style>{canvas_css}\n{css}</style>')
canvas_html=canvas_html.replace('<!--SHELL-->',shell('spaces',True))
canvas_html=canvas_html.replace('<!--SCRIPTS-->','<script>'+firebase+'\n'+app+'\n'+library+'\n'+canvas+'</script>')
(out/'nodes.html').write_text(canvas_html)

print('Built Magic pages:', ', '.join(p.name for p in out.glob('*.html')))
