# Контракт с gnosis и необходимые расширения

Этот документ разделяет существующий API, используемый приложением, и предлагаемый серверный контракт. Пути `/api/generation` ниже пока не реализованы. Frontend не обращается к ним и не имитирует их наличие.

## Существующие операции

| Операция                                       | Контракт                                                                    | Использование                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/config`                              | Публичные `keycloak.url`, `realm`, `clientId`                               | Начало входа                                                           |
| `POST /api/login`                              | `{resource: KEYCLOAK, data: {codeOrToken, redirectUri}}` → `{sid,idToken?}` | Обмен authorization code                                               |
| `GET /api/init`                                | `{user, balances}`                                                          | Профиль и кошельки                                                     |
| `POST /api/logout`                             | Сейчас handler не отзывает токен                                            | Только завершение UI-сессии; серверный отзыв требуется                 |
| `GET /api/aimodels?provider=…`                 | Массив `reference/name/schema/capabilities/endpoints?`                      | Модели и ограничения                                                   |
| `GET /api/aimodels/details?provider=…&model=…` | Полное описание модели                                                      | Уточнение модели в будущей детализации                                 |
| `POST /api/task`                               | `{model,task,options,payer?,traceId?}` → `{result,cost}`                    | Синхронное ожидание результата; для видео до 20 минут на клиенте/proxy |
| `GET /api/task/:session`                       | Прогресс активной задачи                                                    | Не является постоянной историей, завершённая запись исчезает из Map    |
| `DELETE /api/task/:session`                    | Попытка abort активной задачи                                               | Не выставляется в UI как гарантированная отмена видео/возврат          |
| `GET /api/task/cost/:operationId`              | `IAiTaskCost`                                                               | Уточнение pending cost без повторной генерации                         |
| `POST /api/file`                               | multipart с полем `file`                                                    | Загрузка референса                                                     |
| `POST /api/fileBuffer`                         | `{name,input:{source,mime},tags?}`                                          | Сохранение результата изображения                                      |
| `GET /api/file`                                | Пагинация, `conditions`, `sort` как JSON в query                            | Библиотека текущего пользователя                                       |
| `GET /api/file/:id`                            | Метаданные файла с проверкой доступа                                        | Видео, оригинал и предпросмотр                                         |

Выполняются только адаптеры, подтверждённые каталогом: image `OPEN_AI_IMAGE_GPT`, `OPEN_ROUTER_IMAGE`; video `OPEN_ROUTER_VIDEO`. Конкретные названия моделей не зашиты в production-код.

Для image результат — массив `{mime,width,height,source}`. Это не file IDs: клиент пока отдельно сохраняет изображения. Для video результат — `{externalId,fileId}`: файл уже сохранён backend. `cost.amounts` содержит `{amount,coinId}`, суммы — строки.

`task.session` используется для корреляции, но не является ключом идемпотентности. `TaskService.execute` может abort текущую задачу с такой session и начать новую. Повторять POST с тем же session как «безопасное восстановление» нельзя.

## P0: постоянный журнал генераций

Предлагаемый новый модуль `generation` в gnosis. Его задача — надёжное выполнение и продуктовая история, не дублирование адаптеров провайдеров.

### API

- `POST /api/generation` с заголовком `Idempotency-Key` и нормализованным request → `202 {generation}`. Повтор того же запроса с тем же ключом у того же пользователя возвращает тот же ID; другой payload → 409.
- `GET /api/generation/:id` → текущий объект только для владельца или явно разрешённого администратора.
- `GET /api/generation?cursor=…&kind=image|video&status=…` → cursor pagination по `createdAt,id`.
- `POST /api/generation/:id/cancel` → актуальное состояние запроса отмены. Нельзя обещать отмену или возврат, если провайдер уже выполнил задачу.
- `POST /api/generation/:id/retry-save` → повтор только получения/сохранения готового результата. Повтор модельной генерации — новая операция и новый ключ.
- Опционально `GET /api/generation/events` (SSE) с `Last-Event-ID`. Истина остаётся в GET и БД, события только ускоряют синхронизацию.

### Данные

`generation`: UUID, userId, kind, idempotencyKey, requestHash, normalizedRequest, model snapshot/schema version, status, providerExternalId, billingOperationId, created/started/finishedAt, errorCode, safeErrorMessage, costStatus, version.

`generation_result`: generationId, ordinal, fileId, mime, dimensions/duration; уникальность `(generationId, ordinal)` предотвращает повторное создание связей и файлов.

`generation_event`/outbox: generationId, sequence, eventType, payload, deliveredAt. Очередь не должна зависеть от процесса HTTP. PostgreSQL outbox с worker lease достаточно для начала; Redis/BullMQ возможен при реальной нагрузке, но не заменяет журнал БД.

Сохраняется снимок пользовательского запроса после валидации. В нём нет provider secrets, Bearer SID или произвольных внешних данных с секретами. Владение входными файлами проверяется сервером заново при запуске.

### Машина состояний

```text
draft (только UI)
  -> queued -> submitting -> running -> saving -> succeeded
                  |            |        |
                  |            |        -> save_failed -> saving
                  |            -> failed / cancel_requested
                  -> unknown (ответ провайдера неоднозначен)
cancel_requested -> cancelled / running / succeeded
unknown -> running / saving / succeeded / failed после сверки
```

`queued` отменяется без провайдера. `submitting` при падении процесса нельзя безусловно повторять: внешняя задача могла уже быть принята. Если провайдер поддерживает idempotency, используется стабильный ключ; иначе запись переводится в `unknown` и сверяется через внешний ID/журнал. Exactly-once внешнего вызова без поддержки провайдера не обещается.

Lease и heartbeat позволяют перехватить зависший worker. Оптимистическая version или блокировка защищает переходы. `saving` повторяется идемпотентно. Возвращение результата клиенту не является условием списания или сохранения.

### Биллинг

Новая оболочка передаёт стабильный `billingOperationId` в существующую цепочку исполнения. Нельзя отдельно списывать в GenerationService и ещё раз в TaskBillingService/AiAsyncJobService. Pending costs связываются с generation и существующей проводкой.

Генерация может завершиться при `cost.status=PENDING`; результат уже доступен, стоимость обновляется отдельно. Для `UNAVAILABLE` не показывается нулевая цена. При одновременных запусках нужны серверные лимиты и атомарная проверка/резервирование расхода, а не блокировка кнопки в одной вкладке.

Обязательные проверки: повтор POST; два параллельных POST; разный payload при одном ключе; падение до/после submit; падение при сохранении; повтор webhook; двойное списание; pending settlement; смена владельца в query; перезапуск worker; отмена одновременно с завершением.

## P0: сессии и logout

Сейчас LogoutController возвращает успех без инвалидирования SID. Для новой публичной студии нужно:

1. Отдельная серверная session entity или явное управление сроком/отзывом токенов входа.
2. Logout отзывает текущую сессию; logout-all — отдельная операция.
3. Cookie-режим для браузера: `HttpOnly`, `Secure`, разумный SameSite, CSRF для writes, точный Origin allowlist.
4. Короткий срок, rotation/refresh и очистка отозванных сессий; поведение на 401 определено.
5. OAuth state/nonce и verifier для PKCE поддержаны на стороне обмена, а redirect URI проверяется allowlist.

Frontend сейчас выполняет локальный выход и очищает кэш. Это не объявляется полноценным отзывом серверного токена. Keycloak SSO-сессия при локальном выходе также может остаться активной; глобальный выход должен быть отдельным понятным действием.

## P1: точность видеокаталога

Текущая video schema перечисляет duration/resolution/aspectRatio, но не всегда реальные значения и ограничения конкретной модели. Нужны проверенные enum/min/max, ограничения first/last frame и звука, допустимые MIME, размеры/вес референсов. Capability и request schema должны согласованно описывать image-to-video. В UI нельзя обещать 4K или 15 секунд только потому, что такое поле есть в общем DTO.

## P1: media и цены

- Первые/последние кадры в новом generation API лучше передавать как owned file IDs с role, не произвольные URL. Backend выдаёт провайдеру доступную ссылку с нужным сроком.
- Проверить приватность существующего `file.path`. Защита metadata endpoint не делает публичный S3 URL приватным. Для закрытых материалов нужны signed URLs/прокси и обновление истёкших ссылок.
- Поддержать thumbnails/posters и размеры видео, чтобы библиотека не скачивала полноразмерные файлы для сетки.
- `POST /api/generation/quote` допустим только с явной семантикой estimate, валютой, сроком и допущениями; quote не следует выдавать за точную итоговую цену.
- Checkout и webhook пополнения — в gnosis. Клиентский redirect «успешно оплачено» не увеличивает баланс.

## Порядок внедрения

Сначала generation journal и session revocation, затем переход frontend с legacy `/task` на новые операции. После этого — точность video schema, media security, квоты и реальные staging-тесты. Checkout, команды, шаблоны и публичная галерея развиваются отдельно. Старый API сохраняется для существующего gnosis frontend до завершения миграции.
