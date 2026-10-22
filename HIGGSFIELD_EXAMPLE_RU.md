# Higgsfield Seedance 2.5: серверный пример

Официальный SDK: @higgsfield/client/v2. Зависимости устанавливаются через npm; пример находится в index.ts и не включается в HTML-сборку.

В локальном .env.local установи HF_CREDENTIALS=ID:SECRET. Не добавляй значение в исходники, комментарии к коду, скриншоты или GitHub. Этот файл исключён в .gitignore и в локальном скрипте публикации.

Запуск платного примера: npm run higgsfield:example. Если среда запрещает дочерние процессы esbuild/tsx, Node 24 может запустить его напрямую: node --experimental-strip-types index.ts.

Параметры: A cinematic scene at sunset; 5 секунд; 720p; 16:9; MP4; звук включён. subscribe ожидает конечный результат. Успех определяется только по status=completed и наличию video.url. Повтор POST при ошибках отключён. Сырые ошибки SDK не выводятся, чтобы не раскрыть авторизационные заголовки.

Проверка 22.10.2026: пример запущен, API вернул HTTP 403; URL видео не получен. SDK относит этот ответ к NotEnoughCreditsError. Проверь отдельный API-баланс и доступ аккаунта. Успешная генерация не подтверждена. Веб-сайт и автоматическое переключение BytePlus→Higgsfield этим примером ещё не подключаются.

Документация:
https://docs.higgsfield.ai/docs/how-to/sdk
https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference
