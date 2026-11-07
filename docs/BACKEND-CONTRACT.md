# Существующий контракт gnosis

Новый frontend использует беседы и универсальные инструменты. Контракт каталога от 2026-11-07 опубликован согласованно с backend, common и обоими клиентами. Все перечисленные ниже пути реализованы в gnosis.

| Операция                             | Назначение                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| GET `/api/config`, POST `/api/login` | Конфигурация Keycloak, обмен code на SID                                                               |
| GET `/api/init`, POST `/api/logout`  | Аккаунт, балансы, локальное завершение входа                                                           |
| GET `/api/aimodels`                  | Каталоги ассистентов и image/video-моделей                                                             |
| POST `/api/conversation`             | Беседа с моделью ассистента и `options.tools`                                                          |
| GET `/api/conversation`              | Пагинация собственных бесед: `conditions.userId` обязателен в клиенте, в том числе для администраторов |
| GET `/api/conversation/:id`          | Настройки и статус рабочей беседы                                                                      |
| POST `/api/conversation/:id/message` | USER-сообщение, файлы, временные настройки инструмента                                                 |
| GET `/api/conversation/:id/message`  | История; query обязательно содержит `conditions.conversationId`                                        |
| POST `/api/file`, GET `/api/file`    | Загрузка референсов и библиотека                                                                       |

В текущем живом API фильтр `tags INCLUDES_ALL` вернул 500. Frontend его не использует: список загружает собственные беседы всех клиентов. Новые работы помечаются `genfactory` для атрибуции, но функциональность не зависит от фильтра по тегам.

## Прогресс и баланс

GET `/api/task/conversation{id}` возвращает `{data: {tools: [{uid, name?, status?}], value?}}`. Отсутствие status у инструмента означает активный вызов; ERRORED — ошибка. 404 после завершения нормален, постоянная история находится в беседе. UI использует только названия/статусы, без args.

Socket.IO `/gnosisai`, путь `/socket.io`, auth `{token: sid}`. Подключение, команды комнат с подтверждением и восстановление подписок обслуживает `@ts-core/socket-client`, как в основном фронте. Одно соединение на аккаунт; подписки комнат `conversation{id}` живут до удаления последнего подписчика. События содержат `uid`, `name`, `data`; задачи фильтруются по `data.session`. При смене аккаунта соединение закрывается. `FilePreviewChangedEvent` обновляет файлы и обложки бесед.

Баланс `/init` и amount финансовой проводки выражены в minor units: RUB/копейки, USD/центы. Стоимость провайдера в `cost.amounts`/details.amounts выражена в major units. Эти величины нельзя форматировать одной функцией без указания единиц.

## Редактирование и каталог инструментов

GET `/api/aimodel/:provider` возвращает `tools` с uid, именем и признаком устаревания. Это отдельный маршрут от GET `/api/aimodels`. В новом выборе скрываются устаревшие подключения; сохранённые показываются и могут быть сняты пользователем.

PUT `/api/conversation/:id` используется для переименования и явного сохранения подключений. Клиент предварительно читает текущую беседу и передаёт `model` и все текущие `files` по ID: существующий обработчик обрабатывает массив файлов даже при изменении других полей. При изменении tools остальные options сохраняются. GET `/api/conversation` принимает `conditions.status = LOADING` вместе с обязательным ограничением userId.

## Настройки инструментов

```json
{
  "uid": "IMAGE",
  "settings": {
    "model": { "provider": "OPEN_AI_IMAGE_GPT", "model": "<из каталога>" },
    "options": { "quality": "high" }
  }
}
```

Подключения находятся в `conversation.options.tools`. Для одного запроса та же структура передаётся в `message.settings.tools`; можно переопределять только уже подключённые инструменты. Смена провайдера/модели не должна переносить несовместимые параметры предыдущей модели. Универсальные `IMAGE`/`VIDEO` предпочтительнее устаревших привязанных к провайдеру идентификаторов.

`conversation.model` — адаптер разговорной модели. `conversation.options.model` — конкретная модель ассистента. Это не поля модели изображения или видео.

## Отправка сообщения

```json
{
  "role": "USER",
  "text": "Создай видео с помощью VIDEO.\nРеференсы (fileIds, порядок важен): 42.\n\nПлавное приближение камеры",
  "files": [42],
  "settings": {
    "tools": [
      {
        "uid": "VIDEO",
        "settings": { "model": { "provider": "OPEN_ROUTER_VIDEO", "model": "<из каталога>" }, "options": {} }
      }
    ]
  }
}
```

Backend сохраняет сообщение и запускает беседу. Ответ ассистента с файлами сохраняется серверным обработчиком. Этот POST может ожидать завершения; безопасный клиентский retry отсутствует и не включается. На сетевой ошибке нужно читать состояние и сообщения, а не отправлять запрос повторно автоматически.

У `ConversationMessage` есть `id`, `role`, `text`, `files`, `createdDate`. Отдельных публичных полей стоимости и снимка параметров запуска в этом контракте нет. Статус беседы `LOADED` означает завершение обработки, а не доказательство получения желаемого изображения: текст ответа и вложения отображаются как есть.

## Существующие гарантии и ограничения

- Conversation execution ID защищает завершение от запоздавшего результата другого запуска; ответ и завершение беседы записываются транзакционно.
- ImageTool сохраняет изображение и учитывает стоимость до записи файла. Video использует постоянное задание `ai_async_job`, поллер и сохранённый файл.
- Инструменты делятся файлами в одном запуске, а последующие сообщения получают файлы из учитываемой истории.
- Отсутствие браузерного соединения не запрещает серверному обработчику сохранить результат. Это не означает восстановления всей агентной цепочки после падения процесса.
- Параметры инструментов являются предпочтениями, которые аргументы tool call могут переопределить. Строгая фиксация параметров/числа вызовов не заявляется.
- Logout handler пока не отзывает SID; frontend завершает локальную сессию. Полноценный отзыв и защищённые cookie остаются отдельной задачей.
- Защита метаданных файла не доказывает приватность его URL. Политику доступа к медиа необходимо проверить перед публичным выпуском.
- Видеокаталог не всегда содержит полные enum/границы конкретных моделей; frontend не выдумывает ограничения.
- Checkout и предварительная цена в используемом API отсутствуют. Отображается баланс gnosis без самостоятельного кошелька Genfactory.

Предыдущая версия документа предлагала отдельный `/api/generation`. Это предложение снято как обязательное условие интеграции: существующие беседы и инструменты уже решают основную задачу. Возможные улучшения устойчивости следует делать внутри существующих механизмов после целевых проверок.

### File result settings and tag search (local backend changes, migration 16271212600047)

Conversation create/edit/read supports `fileOutput: { directory?: string | null, tags?: string[] }`. Missing settings keep legacy behavior; null directory means root and [] means no tags. Studios save edited settings before sending the next message. File uploads accept directory UID path and tags (JSON array or repeated multipart fields) in one request. These are not human-readable folder names.

Local update 2026-11-07: GET /api/fileTag accepts JSON `conditions` and `sort` plus `pageIndex`/`pageSize`, returning `{ items: [{tag, count}], total, pages, pageIndex, pageSize }`, scoped to the current user. Prefix suggestions use `conditions = { tag: { condition: "CONTAINS", value: "prefix%" } }`; the client escapes literal `%`, `_` and backslashes in the typed prefix. Conditions on `count` apply after distinct-file aggregation. Default order is count descending then tag ascending. The former separate `search` parameter is removed; this frontend requires the updated backend. Tag matching via GET /api/file continues to use `conditions.tags = {type: "ARRAY", condition: "INCLUDES_ALL" | "INCLUDES_ONE_OF", value: ["tag"]}`. Count and result pagination cover all matching files, not just the visible page. This contract change has not been deployed.

File `origin` records kind (UPLOAD/GENERATION/PROCESSING), optional operationId and historical sourceFileIds; these are a provenance snapshot rather than foreign keys. Existing conversation/message attachment relations remain authoritative. `origin.directoryFallback` tells the viewer that a finished generated result had to be saved in root after its destination disappeared. The backend validates settings before execution and persists the snapshot in asynchronous video jobs.

## Audio conversations

`/audio?mode=tts|stt&conversation=<id>` uses the same conversation APIs and socket rooms as the visual studios. Discover tool providers from `/aimodel/<conversation-provider>` and model settings/validation from `/aimodels`. Persist `TTS` or `STT` connections in conversation options and send the selected connection in message settings. Model/voice/format lists are not duplicated in the client.

TTS attaches an audio file; STT receives the exact selected audio/video file ID and `isFile=true`, attaching a full TXT transcript with source provenance. Files inherit the conversation output directory/tags. The library and message viewer provide playback/download; an accepted request with a network failure must not be retried automatically. Audio editor and library uploads accept files up to 1 GB (1,000,000,000 bytes); the frontend and public nginx proxies match the existing API limit of 1 GiB per request, leaving room for multipart headers. This upload limit is separate from model capabilities; STT splits long recordings on the backend.

### Authenticated file content (live audio verification follow-up)

- `GET /api/file/:id/text` returns `{ text }` for UTF-8 TXT files (2 MiB maximum, enforced while streaming). Uses the existing file permission checks; rejects other formats, missing files, and oversized content.
- `GET /api/file/:id/content` streams original bytes with a download filename and original MIME. Used by the viewer download button for images, audio, video and documents. Directories and unresolved links are rejected.
- Both routes require authentication and send `Cache-Control: private, no-store`. Browser code no longer depends on storage CORS for reading TXT or downloading originals. No AI calls or balance charges for these endpoints.
- Tool connections carry the model only in `settings.model`; `settings.options` must exclude `model`, even though model catalog validation requires `options.model` in a direct task request.

## Каталог моделей — опубликовано 2026-11-07

`GET /api/aimodels` теперь возвращает страницу `{items,total,pages,pageIndex,pageSize}`, а не массив. Provider и статус передаются через общий `conditions`: `{"provider":"OPEN_AI_IMAGE_GPT","status":"ACTIVE"}`. Поддерживаются стандартные sort/pageIndex/pageSize (максимум 500); клиент обходит все страницы. Верхнеуровневый provider и специальные флаги видимости не используются.

Описание содержит id/status/sortOrder, но не тариф. ACTIVE доступна для выбора; HIDDEN сохраняется в старых настройках и может запускаться; DISABLED сохраняется для просмотра, но новый запуск отклоняется. Сохранённая модель, которой нет в ACTIVE, загружается через `GET /api/aimodels/details?provider=...&model=...`; клиент не заменяет её первой доступной. Пустой успешный каталог не подменяется встроенным списком. Backend проверяет статус до платного вызова; уже принятые асинхронные задания завершаются.

AiModelChangedEvent обновляет запросы каталогов и сохранённых описаний в открытом Genfactory; тариф в событие не входит. Ошибки AI_MODEL_HIDDEN/AI_MODEL_DISABLED имеют безопасные сообщения для пользователя.

Административные GET `/api/management/aimodel` и PUT `/api/management/aimodel/:id` доступны только ADMINISTRATOR. GET использует общую фильтрацию и возвращает записи с тарифами. PUT изменяет name/status/sortOrder/price; идентичность provider/model неизменяема. Управление опубликовано в старом Angular-клиенте (/managementAiModels); отдельного экрана в Genfactory нет. Миграция 54 и однократный импорт переносят цены ai_price без изменения их валют/единиц; ai_price сохраняется для отката. Первый успешный импорт адаптера сохраняет исходный активный набор, новые модели последующих синхронизаций создаются HIDDEN. Административные изменения не перезаписываются.

Контракт требует согласованной выкладки backend/common/Angular/Genfactory. Обновление опубликовано 2026-11-07: backend 86c4f5e / common 8cce241 / Angular 228a5b1 / Genfactory 8e7079f. Миграция 54 применена на production, 122 перенесённых тарифа сверены без расхождений.
