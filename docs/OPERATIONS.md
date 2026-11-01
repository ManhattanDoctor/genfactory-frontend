# Разработка и выпуск

## Локальное окружение

Frontend: `http://127.0.0.1:5173`. Backend задаётся `GNOSIS_API_TARGET` только для Vite proxy. `VITE_API_BASE` по умолчанию `/api`; все переменные с `VITE_` публичны, provider keys и client secrets туда не помещаются.

Существующий backend на 3015 в рабочем окружении может быть запущен со старой версией кода. Контракты нужно сверять с выбранным процессом и опубликованным OpenAPI. Сам frontend не меняет backend, его БД или серверную конфигурацию при старте.

## Production

Сначала выполните release gates из архитектуры и backend-контракта. `npm run build` создаёт `dist`. Публикация этих файлов не развёртывает gnosis и не настраивает Keycloak.

Reverse proxy должен:

- Отдавать frontend по HTTPS и делать SPA fallback на `index.html` только для маршрутов интерфейса.
- Направлять `/api/` в gnosis без fallback на HTML. При сохранении legacy `/task` нужны согласованные upstream/client таймауты не меньше 20 минут. После перехода на generation API долгий HTTP-запрос не нужен.
- Не записывать Authorization, cookies, OAuth code, промпты или тела fileBuffer в access/error logs.
- Возвращать корректный cache policy: hashed assets — immutable, `index.html` — revalidate, персональные API — private/no-store.
- Ограничить размер загрузки и частоту запросов в соответствии с backend. UI-ограничение в 20 МБ для референса не заменяет серверное.
- Настроить точный CSP для application origin, auth origin и media host; не разрешать произвольные scripts. Шрифты поставляются локально через Fontsource, запросов к Google Fonts нет.

В Keycloak разрешить точные redirect URIs `/auth/callback` для staging/production. Не добавлять wildcard на неизвестные домены. Для cookie-auth отдельно настроить CSRF и Origin, не считать CORS достаточной защитой.

## Тестовая матрица

1. `npm ci`, `npm run build`, `npm test`, `npm run test:e2e`, `npm audit`.
2. Desktop 1440px и mobile 390px: обзор, меню, редактор, библиотека, модальный просмотр, клавиатура и Escape.
3. Read-only smoke с настоящим gnosis: init, image/video catalog, file list, account balances; токен не выводится в логи и не сохраняется в fixture.
4. На staging по согласованному бюджету: одна image и одна video генерация, проверка сохранённого файла и финансовой записи. Это отдельная проверка, не скрытый шаг CI.
5. Production gates: новая generation API — refresh/reconnect, duplicate submission, worker restart, cancellation race, no double billing; сессии — expire/logout/revoke; media — недоступность чужих файлов.

## Наблюдаемость

В будущем generationId и billingOperationId связывают UI, worker и проводку. Метрики: время queued/running/saving, ошибки по адаптерам, неизвестные submit outcomes, latency окончательного cost, доля несохранённых результатов. Логи содержат безопасный код ошибки; промпты и медиа не отправляются в аналитические сервисы по умолчанию.

Клиентская аналитика, если будет добавлена: просмотр экрана, выбор сценария, начало загрузки, submit/состояние результата. Без сырого prompt, SID, email или URL приватного медиа. Для начала внешняя аналитика не подключена.

## Что не делалось автоматически

Старый сайт `genfactory.ru` и его сервисы не изменялись. Исходный сервер использовался для чтения HTML/CSS/JS; медиа взяты с публичного сайта. Не выполнялись миграция старых пользователей, перенос балансов, платные модельные вызовы, push в GitHub или production deploy.
