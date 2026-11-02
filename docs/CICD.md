# CI/CD Genfactory

Повторяет схему `gnosis-frontend`: отдельные ручные BUILD и DEPLOY и общий RELEASE, который вызывает их последовательно через reusable workflows. Автоматический production deploy при push не включён.

## Workflows

| Workflow                         | Когда запускается                  | Результат                                                                                                    |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend checks (`ci.yml`)       | push, pull request, вызов из BUILD | Форматирование, production build, unit/e2e, синтаксис shell, Docker build, nginx и container smoke           |
| GENFACTORY — BUILD               | вручную или из RELEASE             | После checks собирает выбранный commit, публикует `latest` и `sha-<commit>` в GHCR, возвращает digest        |
| GENFACTORY — DEPLOY (PRODUCTION) | вручную с digest или из RELEASE    | По SSH обновляет только контейнер `genfactory-frontend`, проверяет health, при неудаче возвращает предыдущий |
| GENFACTORY — RELEASE             | вручную                            | BUILD → DEPLOY именно того digest, который вернула сборка                                                    |

Образ: `ghcr.io/manhattandoctor/genfactory-frontend/genfactory-frontend`. Для деплоя используется `@sha256:…`, а не изменяемый тег `latest`. Checkout использует выбранную при запуске ветку/commit, без жёсткой привязки к `master`. Деплои сериализованы и не отменяют друг друга посередине замены контейнера.

## Настройка GitHub

В репозитории `ManhattanDoctor/genfactory-frontend` настройте environment `production` и его secrets (можно использовать repository secrets):

| Secret            | Содержимое                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| `SSH_KEY`         | Приватный SSH-ключ пользователя деплоя                                     |
| `SSH_HOST`        | IP или DNS сервера, без схемы и порта; используется SSH 22                 |
| `SSH_USERNAME`    | Пользователь с правами запуска Docker                                      |
| `SSH_KNOWN_HOSTS` | Проверенная запись публичного host key этого сервера в формате known_hosts |

`GITHUB_TOKEN` выдаётся автоматически: BUILD получает `packages: write`, DEPLOY — `packages: read`. Отдельный registry password не нужен. Вход на сервере использует `--password-stdin` и временный Docker config, который удаляется после выполнения. Проверка host key обязательна, `StrictHostKeyChecking=no` не используется.

Variables environment `production`:

| Variable        | По умолчанию              | Назначение                                                             |
| --------------- | ------------------------- | ---------------------------------------------------------------------- |
| `API_URL`       | `https://api.gnosisai.ru` | Origin backend, без завершающего `/`, пути `/api`, query и credentials |
| `FRONTEND_PORT` | `8081`                    | Порт frontend на loopback сервера: `127.0.0.1:8081`                    |

Vite собирается с `VITE_API_BASE=/api`. `API_URL` задаётся при запуске контейнера, поэтому смена backend не требует пересборки frontend. `GNOSIS_API_TARGET` используется только локальным dev-server и не управляет production контейнером. Пользовательский браузер обращается к API и socket на том же origin сайта; контейнер проксирует их на `API_URL`, сохраняя пути `/api/…` и `/socket.io/…`.

На сервере должны быть Docker, Bash, доступ к GHCR и указанному API. Новый сервис не использует имя `gnosisai-frontend` и его порт 8080; backend и старый сайт workflow не изменяет.

## Первый выпуск

1. Отправить проверенные изменения в GitHub. Workflow должен присутствовать на default branch, чтобы появилась кнопка ручного запуска.
2. Настроить secrets/variables и проверить, что production API поддерживает контракты из `BACKEND-CONTRACT.md`.
3. Подготовить HTTPS reverse proxy домена: upstream `http://127.0.0.1:8081`, WebSocket Upgrade, таймауты не меньше 1200 секунд и загрузки до 25 МБ. TLS завершает внешний proxy. Не отдавать персональные API из cache.
4. В SSO зарегистрировать точный `https://<домен>/auth/callback`. На новом домене отдельно проверить вход, возврат, выход и повторный вход.
5. Запустить GENFACTORY — RELEASE на выбранной ветке. BUILD также можно запускать отдельно; digest появляется в его summary. DEPLOY принимает эту строку `sha256:…` для ручного запуска.
6. Проверить production URL: `/`, прямой `/image`, `/video`, `/auth/callback`, API, библиотеку и загрузку медиа. Health контейнера проверяет nginx, но не заменяет проверку доступа к backend/SSO. Реальные платные генерации выполняются отдельно по согласованному бюджету.

`API_URL` разрешает HTTP для внутреннего доверенного контура и HTTPS для внешнего API. Для HTTPS включены SNI и проверка сертификата backend. Для внутреннего Docker DNS контейнеру потребуется соответствующая сеть; текущий скрипт использует стандартную Docker network и рассчитан на доступный с сервера origin.

## Откат

Перед заменой скрипт скачивает новый образ и создаёт контейнер `genfactory-frontend-next`. Предыдущий сохраняется остановленным как `genfactory-frontend-previous`, вместе с настройками его запуска. Если новый контейнер не запускается или не становится healthy за 60 секунд, скрипт удаляет неудачную замену и запускает предыдущий. На первом выпуске предыдущего контейнера нет.

При успешной проверке предыдущий контейнер остаётся до следующего релиза. Его образ можно узнать через `docker inspect --format '{{.Config.Image}}' genfactory-frontend-previous`. Для отката после обнаружения функциональной ошибки запустите DEPLOY с digest последнего исправного образа. Теги `sha-<commit>` позволяют найти релиз в GHCR.

Замена одного контейнера означает короткий перерыв в обслуживании; это не zero-downtime deployment. Перезапуск frontend может оборвать текущий долгий HTTP-ответ. Клиент должен восстановить состояние беседы через GET, а не автоматически повторять платную генерацию. Для переключения без перерыва впоследствии нужен отдельный upstream-switch во внешнем proxy.

## Локальная проверка контейнера

```bash
npm ci
npm run build
npm test
npm run test:e2e
docker build -f docker/genfactory/Dockerfile -t genfactory-check .
docker run --rm genfactory-check nginx -t
bash scripts/container-smoke.sh genfactory-check
```

Smoke поднимает изолированный тестовый API, проверяет SPA fallback, OAuth route, проксирование API и Upgrade header, 404 отсутствующего asset, cache policy, отсутствие query в access log и отказ при некорректном API_URL. Реальный backend и платные инструменты не вызываются. Unit-тесты deploy-скрипта проверяют замену контейнера, откат при ошибке старта и отклонение неприкреплённого к digest образа.

Production Genfactory: `https://genfactory.gnosisai.ru`, сервер `178.208.65.196`, внешний nginx — файл `gnosis-frontend/nginx/gnosisai.ru`. SSH secrets и variables для первого выпуска настроены в репозитории. Для CI используется текущий SSH-ключ пользователя, сохранённый в GitHub secret `SSH_KEY`. Отдельный ключ не используется.

Runner зафиксирован на Ubuntu 24.04: Playwright 1.58 не поддерживает Ubuntu 26.04, на которую перешёл `ubuntu-latest`. Обновление ОС runner и Playwright следует проверять вместе.

Сборка выпускает `/genfactory-sw.js` с идентификатором той же сборки, что и JavaScript приложения. Nginx отдаёт его с `Cache-Control: no-store`, HTML — с `no-cache`. `npm run test:sw` после build поднимает отдельный HTTPS-стенд с двумя версиями приложения и проверяет реальный жизненный цикл SW, сохранение черновика, запрет обновления при активной работе и отсутствие SW на localhost. Этот тест включён в CI. Первая выкладка с SW устанавливает механизм; уведомление появляется при следующем релизе.
