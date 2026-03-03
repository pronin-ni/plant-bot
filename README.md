# Plant Bot + Telegram Mini App

Проект запускает в **одном контейнере**:
- Spring Boot backend (`/api/...`)
- Telegram Mini App (`/mini-app/...`)

## Быстрый старт (Docker)

1. Создать `.env` из шаблона:
```bash
cp .env.example .env
```
2. Заполнить минимум:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `APP_PUBLIC_BASE_URL` (внешний URL, например `https://plant.example.com`)
3. Запустить:
```bash
docker compose build
docker compose up -d
```

## URL

- API: `https://<domain>/api/...`
- Mini App: `https://<domain>/mini-app/`
- Healthcheck: `https://<domain>/actuator/health`

В BotFather для WebApp указывать:
`https://<domain>/mini-app/`

## Portainer Stack (copy/paste)

```yaml
version: "3.9"
services:
  plant-bot:
    build:
      context: /path/to/plant-bot
      dockerfile: Dockerfile
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
      BOT_UPDATE_THREADS: "${BOT_UPDATE_THREADS:-4}"
      OPENROUTER_API_KEY: "${OPENROUTER_API_KEY}"
      OPENROUTER_MODEL: "${OPENROUTER_MODEL}"
      OPENROUTER_MODEL_PLANT: "${OPENROUTER_MODEL_PLANT}"
      OPENROUTER_MODEL_CHAT: "${OPENROUTER_MODEL_CHAT}"
      OPENROUTER_CARE_CACHE_TTL_MINUTES: "${OPENROUTER_CARE_CACHE_TTL_MINUTES:-10080}"
      OPENROUTER_WATERING_CACHE_TTL_MINUTES: "${OPENROUTER_WATERING_CACHE_TTL_MINUTES:-720}"
      OPENROUTER_CHAT_CACHE_TTL_MINUTES: "${OPENROUTER_CHAT_CACHE_TTL_MINUTES:-10080}"
      OPENWEATHER_API_KEY: "${OPENWEATHER_API_KEY}"
      PERENUAL_API_KEY: "${PERENUAL_API_KEY}"
      TELEGRAM_AUTH_MAX_AGE_SECONDS: "${TELEGRAM_AUTH_MAX_AGE_SECONDS:-86400}"
      WEB_CORS_ALLOWED_ORIGINS: "${WEB_CORS_ALLOWED_ORIGINS:-*}"
      APP_PUBLIC_BASE_URL: "${APP_PUBLIC_BASE_URL:-http://localhost:8080}"
      TZ: "Europe/Moscow"
      HTTP_CLIENT_CONNECT_TIMEOUT_MS: "${HTTP_CLIENT_CONNECT_TIMEOUT_MS:-5000}"
      HTTP_CLIENT_READ_TIMEOUT_MS: "${HTTP_CLIENT_READ_TIMEOUT_MS:-15000}"
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
