# Plant Bot + Telegram Mini App

Проект запускает в **одном контейнере**:
- Spring Boot backend (`/api/...`)
- Telegram Mini App (`/mini-app/...`)
- PWA frontend (`/pwa/...`)

Feature-toggle (runtime, без отключения backend API):
- `TELEGRAM_BOT_ENABLED=true|false` — включить/выключить Telegram LongPolling бота.
- `APP_FEATURE_MINI_APP_ENABLED=true|false` — включить/выключить web-роуты Mini App (`/mini-app/...`).
- `APP_FEATURE_PWA_ENABLED=true|false` — включить/выключить web-роуты PWA (`/pwa/...`).

## Быстрый старт (Docker)

1. Создать `.env` из шаблона:
```bash
cp .env.example .env
```

2. Выбрать режим запуска.

Полный режим (бот + API + Mini App):
- заполнить `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `APP_PUBLIC_BASE_URL`
- запустить:
```bash
docker compose up -d --build
```

Miniapp-only режим (API + Mini App, без запуска Telegram-бота):
- в `.env` можно оставить Telegram токен/username пустыми
- важно: `TELEGRAM_BOT_ENABLED=false`
- запустить профиль:
```bash
docker compose --profile miniapp-only up -d --build plant-miniapp
```

## Miniapp-only: что это и зачем

`miniapp-only` — это режим, где поднимаются только:
- backend API (`/api/...`)
- Telegram Mini App (`/mini-app/...`)

И **не поднимается Telegram LongPolling bot** (регистрация в Bot API отключена).

Когда использовать:
- локальная/стендовая проверка фронта и REST API без реального bot token;
- деплой Mini App отдельно от Telegram-бота;
- диагностика API/верстки, когда бот временно не нужен.

Что меняется технически:
- `TELEGRAM_BOT_ENABLED=false`
- бин `TelegramConfig` не инициализируется, и приложение не падает на регистрации бота.

Ограничения режима:
- чат-бот в Telegram (команды `/start`, `/add` и т.д.) не работает;
- Mini App работает штатно, но API по-прежнему требует `X-Telegram-Init-Data` для защищенных endpoint'ов.

### Настройка miniapp-only

1. Создать `.env`:
```bash
cp .env.example .env
```

2. Указать минимум:
```env
TELEGRAM_BOT_ENABLED=false
APP_PUBLIC_BASE_URL=https://your-domain.example
WEB_CORS_ALLOWED_ORIGINS=https://your-domain.example
```

3. Запуск:
```bash
docker compose --profile miniapp-only up -d --build plant-miniapp
```

4. Проверка:
```bash
curl -fsS https://your-domain.example/actuator/health
# ожидается: {"status":"UP"}
```

### Как вернуться в полный режим

```env
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<real_token>
TELEGRAM_BOT_USERNAME=<real_username>
```

```bash
docker compose up -d --build plant-bot
```

## URL

- API: `https://<domain>/api/...`
- Mini App: `https://<domain>/mini-app/`
- PWA: `https://<domain>/pwa/`
- Healthcheck: `https://<domain>/actuator/health`

В BotFather для WebApp указывать:
`https://<domain>/mini-app/`

## Переменные для бота + Mini App + PWA

Минимум для production:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `OPENROUTER_API_KEY`
- `APP_PUBLIC_BASE_URL` (например `https://plant.okgk.ru`)
- `APP_SECURITY_JWT_SECRET` (длинный секрет, не дефолтное значение)

Для сборки PWA в Docker (build args через `docker-compose.yml`):
- `PWA_VITE_API_BASE_URL` (обычно пусто для same-origin)
- `PWA_VITE_TELEGRAM_BOT_USERNAME` (username бота)
- `PWA_VITE_PWA_URL` (например `https://plant.okgk.ru/pwa/`)
- `PWA_VITE_BASE_PATH` (для reverse proxy, по умолчанию `/pwa/`)

Отдельный «PWA токен» не нужен: PWA авторизуется через backend JWT.

Ночной backup SQLite (встроен в backend):
- `APP_BACKUP_ENABLED=true`
- `APP_BACKUP_CRON="0 10 3 * * *"` (каждую ночь в 03:10)
- `APP_BACKUP_ZONE=Europe/Moscow`
- `APP_BACKUP_PATH=./data/backups`
- `APP_BACKUP_RETENTION_DAYS=7`
- `APP_BACKUP_FILE_PREFIX=plantbot-backup`

В админ-панели PWA доступно:
- просмотр списка backup-файлов;
- восстановление базы из выбранного backup (для `ROLE_ADMIN`).

## Установка PWA на iPhone/Android

При открытии `/pwa/` автоматически показывается карточка-инструкция с определением платформы:
- iPhone (iOS Safari): шаги через «Поделиться» → «На экран Домой»
- Android: шаги через меню браузера → «Установить приложение / Добавить на главный экран»

Если браузер поддерживает `beforeinstallprompt`, дополнительно показывается кнопка «Установить PWA».

## Portainer Stack (copy/paste)

```yaml
services:
  plant-bot:
    build:
      context: /path/to/plant-bot
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: "${PWA_VITE_API_BASE_URL:-}"
        VITE_TELEGRAM_BOT_USERNAME: "${PWA_VITE_TELEGRAM_BOT_USERNAME:-}"
        VITE_PWA_URL: "${PWA_VITE_PWA_URL:-}"
    image: ghcr.io/pronin-ni/plant-bot:latest
    container_name: plant-bot
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8080/actuator/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    environment:
      TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN}"
      TELEGRAM_BOT_USERNAME: "${TELEGRAM_BOT_USERNAME}"
      TELEGRAM_BOT_ENABLED: "${TELEGRAM_BOT_ENABLED:-true}"
      BOT_UPDATE_THREADS: "${BOT_UPDATE_THREADS:-4}"
      OPENROUTER_API_KEY: "${OPENROUTER_API_KEY}"
      OPENROUTER_MODEL: "${OPENROUTER_MODEL}"
      OPENROUTER_MODEL_PLANT: "${OPENROUTER_MODEL_PLANT}"
      OPENROUTER_MODEL_PHOTO_IDENTIFY: "${OPENROUTER_MODEL_PHOTO_IDENTIFY}"
      OPENROUTER_MODEL_PHOTO_DIAGNOSE: "${OPENROUTER_MODEL_PHOTO_DIAGNOSE}"
      OPENROUTER_MODEL_CHAT: "${OPENROUTER_MODEL_CHAT}"
      OPENROUTER_CARE_CACHE_TTL_MINUTES: "${OPENROUTER_CARE_CACHE_TTL_MINUTES:-10080}"
      OPENROUTER_WATERING_CACHE_TTL_MINUTES: "${OPENROUTER_WATERING_CACHE_TTL_MINUTES:-720}"
      OPENROUTER_CHAT_CACHE_TTL_MINUTES: "${OPENROUTER_CHAT_CACHE_TTL_MINUTES:-10080}"
      OPENWEATHER_API_KEY: "${OPENWEATHER_API_KEY}"
      PERENUAL_API_KEY: "${PERENUAL_API_KEY}"
      TELEGRAM_AUTH_MAX_AGE_SECONDS: "${TELEGRAM_AUTH_MAX_AGE_SECONDS:-86400}"
      WEB_CORS_ALLOWED_ORIGINS: "${WEB_CORS_ALLOWED_ORIGINS:-*}"
      APP_PUBLIC_BASE_URL: "${APP_PUBLIC_BASE_URL:-http://localhost:8080}"
      APP_SECURITY_JWT_SECRET: "${APP_SECURITY_JWT_SECRET}"
      APP_SECURITY_JWT_TTL_SECONDS: "${APP_SECURITY_JWT_TTL_SECONDS:-2592000}"
      APP_SECURITY_JWT_ISSUER: "${APP_SECURITY_JWT_ISSUER:-plant-care}"
      TZ: "Europe/Moscow"
      HTTP_CLIENT_CONNECT_TIMEOUT_MS: "${HTTP_CLIENT_CONNECT_TIMEOUT_MS:-5000}"
      HTTP_CLIENT_READ_TIMEOUT_MS: "${HTTP_CLIENT_READ_TIMEOUT_MS:-15000}"
    volumes:
      - plantbot-data:/app/data

  # Профиль для Mini App без Telegram-бота
  plant-miniapp:
    profiles: ["miniapp-only"]
    build:
      context: /path/to/plant-bot
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: "${PWA_VITE_API_BASE_URL:-}"
        VITE_TELEGRAM_BOT_USERNAME: "${PWA_VITE_TELEGRAM_BOT_USERNAME:-}"
        VITE_PWA_URL: "${PWA_VITE_PWA_URL:-}"
    image: ghcr.io/pronin-ni/plant-bot:latest
    container_name: plant-miniapp
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8080/actuator/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    environment:
      TELEGRAM_BOT_ENABLED: "false"
      OPENROUTER_API_KEY: "${OPENROUTER_API_KEY}"
      OPENROUTER_MODEL: "${OPENROUTER_MODEL}"
      OPENROUTER_MODEL_PLANT: "${OPENROUTER_MODEL_PLANT}"
      OPENROUTER_MODEL_PHOTO_IDENTIFY: "${OPENROUTER_MODEL_PHOTO_IDENTIFY}"
      OPENROUTER_MODEL_PHOTO_DIAGNOSE: "${OPENROUTER_MODEL_PHOTO_DIAGNOSE}"
      OPENROUTER_MODEL_CHAT: "${OPENROUTER_MODEL_CHAT}"
      OPENROUTER_CARE_CACHE_TTL_MINUTES: "${OPENROUTER_CARE_CACHE_TTL_MINUTES:-10080}"
      OPENROUTER_WATERING_CACHE_TTL_MINUTES: "${OPENROUTER_WATERING_CACHE_TTL_MINUTES:-720}"
      OPENROUTER_CHAT_CACHE_TTL_MINUTES: "${OPENROUTER_CHAT_CACHE_TTL_MINUTES:-10080}"
      OPENWEATHER_API_KEY: "${OPENWEATHER_API_KEY}"
      PERENUAL_API_KEY: "${PERENUAL_API_KEY}"
      TELEGRAM_AUTH_MAX_AGE_SECONDS: "${TELEGRAM_AUTH_MAX_AGE_SECONDS:-86400}"
      WEB_CORS_ALLOWED_ORIGINS: "${WEB_CORS_ALLOWED_ORIGINS:-*}"
      APP_PUBLIC_BASE_URL: "${APP_PUBLIC_BASE_URL:-http://localhost:8080}"
      APP_SECURITY_JWT_SECRET: "${APP_SECURITY_JWT_SECRET}"
      APP_SECURITY_JWT_TTL_SECONDS: "${APP_SECURITY_JWT_TTL_SECONDS:-2592000}"
      APP_SECURITY_JWT_ISSUER: "${APP_SECURITY_JWT_ISSUER:-plant-care}"
      TZ: "Europe/Moscow"
      HTTP_CLIENT_CONNECT_TIMEOUT_MS: "${HTTP_CLIENT_CONNECT_TIMEOUT_MS:-5000}"
      HTTP_CLIENT_READ_TIMEOUT_MS: "${HTTP_CLIENT_READ_TIMEOUT_MS:-15000}"
    ports:
      - "${MINIAPP_PORT:-8080}:8080"
    volumes:
      - plantbot-data:/app/data

volumes:
  plantbot-data:
```

## Основные REST API (Mini App)

- `POST /api/auth/validate`
- `GET /api/plants`
- `GET /api/plants/{id}`
- `POST /api/plants`
- `DELETE /api/plants/{id}`
- `PUT /api/plants/{id}/water`
- `POST /api/plants/{id}/photo`
- `GET /api/plants/search?q=...`
- `GET /api/calendar`
- `GET /api/stats`
- `GET /api/learning`
- `POST /api/users/city`


## Home Assistant интеграция

Что поддерживается:
- безопасное подключение Home Assistant (`/api/home-assistant/config`)
- токен хранится только на backend в зашифрованном виде (AES-GCM), на frontend не возвращается
- автообнаружение комнат (Area) и сенсоров `temperature_*`, `humidity_*`, `soil_moisture_*`, `illuminance_*`
- ручной выбор `entity_id` для температуры, влажности, влажности почвы, освещенности
- почасовой polling Home Assistant c random offset, timeout 10s, retries=3
- fallback на базовый график, если HA недоступен > 6 часов
- Telegram уведомление пользователю при длительной недоступности HA
- мягкая автокоррекция интервала полива (не больше ±35%)
- отключение автокоррекции для конкретного растения
- история корректировок и история условий за 7 дней

Новые API:
- `POST /api/home-assistant/config`
- `GET /api/home-assistant/rooms-and-sensors`
- `PUT /api/plants/{plantId}/room`
- `GET /api/plants/{plantId}/conditions`
- `GET /api/plants/{plantId}/history-conditions?days=7`

HA полностью опционален:
- пользователь указывает URL и токен прямо в Mini App (`Settings -> Home Assistant`);
- если HA не подключён, расчеты идут по базовой логике без HA;
- отдельные переменные для HA в `.env` не нужны.

Безопасность токена HA:
- токен не отдаётся на фронтенд;
- backend хранит его в зашифрованном виде;
- ключ шифрования создаётся автоматически локально в `./data/ha-master.key`.

Frontend (Mini App):
- `Settings -> Home Assistant` — подключение по URL + Token
- `Add Plant` и `Plant Detail` — выбор комнаты/сенсоров и автокоррекции
- `Plant Card` и `Plant Detail` — виджет условий
- `Plant Detail` — график температуры/влажности за 7 дней + предупреждение по освещенности

## OpenRouter: модели для фото (identify/diagnose)

Для фото-запросов используются отдельные переменные:
- `OPENROUTER_MODEL_PHOTO_IDENTIFY` — модель для `POST /api/plant/identify-openrouter`
- `OPENROUTER_MODEL_PHOTO_DIAGNOSE` — модель для `POST /api/plant/diagnose-openrouter`

Рекомендуемые значения:
- identify (быстро/дешево): `google/gemini-flash-1.5` или `qwen/qwen-vl-max`
- diagnose (точнее): `google/gemini-1.5-pro` или `anthropic/claude-3.5-sonnet`

Fallback-логика на backend:
- identify: `OPENROUTER_MODEL_PHOTO_IDENTIFY` -> `OPENROUTER_MODEL_PLANT` -> `OPENROUTER_MODEL`
- diagnose: `OPENROUTER_MODEL_PHOTO_DIAGNOSE` -> `OPENROUTER_MODEL_PHOTO_IDENTIFY` -> `OPENROUTER_MODEL_PLANT` -> `OPENROUTER_MODEL`

Важно:
- фронтенд никогда не ходит в OpenRouter напрямую;
- фото всегда отправляется на backend, и уже backend делает OpenRouter `/chat/completions` с `content: [text, image_url]`.

## Опциональная синхронизация с Google/Apple календарём

Поддерживается подписка на динамический ICS-feed:
- `GET /api/calendar/sync` — получить статус и ссылки
- `POST /api/calendar/sync` — включить/выключить sync
- `GET /api/calendar/ics/{token}` — ICS календарь (подписка)

Как работает:
- пользователь включает sync в настройках Mini App;
- получает `webcal://...`/`https://...` ссылку;
- импортирует в Google/Apple/другой календарь;
- при добавлении/изменении растений события обновляются через подписку на feed.

## Локальная разработка Mini App

```bash
cd plant-care-mini-app
npm install
npm run dev
```


## Проверка перед продом

```bash
# backend
./gradlew clean build -x test

# frontend
cd plant-care-mini-app && npm install && npm run build

# docker config
docker compose config
```

Smoke-check для miniapp-only:
```bash
docker compose --profile miniapp-only up -d --build plant-miniapp
curl -fsS http://localhost:8080/actuator/health
```


## Локальный запуск без Telegram токена

Для разработки Mini App/REST без Telegram initData:

```bash
TELEGRAM_BOT_ENABLED=false APP_DEV_AUTH_ENABLED=true ./gradlew bootRun
```

В этом режиме используется fallback-пользователь из переменных:

- `APP_DEV_TELEGRAM_ID`
- `APP_DEV_USERNAME`

Использовать только для локальной разработки.
