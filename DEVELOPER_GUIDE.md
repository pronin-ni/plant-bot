# Developer Guide — Plant Bot Platform

Практический гайд для разработчиков: как запускать, как деплоить и что проверять перед production.

## 1. Компоненты платформы

Сервис включает:
- Backend API (Spring Boot)
- Telegram Bot (optional)
- Telegram Mini App frontend
- PWA frontend

Один runtime, одна SQLite БД.

## 2. Требования окружения

- Java 17
- Node.js 20+
- npm
- Docker / Docker Compose (для контейнерного запуска)

## 3. Ключевые переменные окружения

Обязательные для production:
- `APP_PUBLIC_BASE_URL`
- `APP_SECURITY_JWT_SECRET`
- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN` (если включен бот)
- `TELEGRAM_BOT_USERNAME` (если включен бот и Telegram Login Widget)

Feature toggles:
- `TELEGRAM_BOT_ENABLED`
- `APP_FEATURE_MINI_APP_ENABLED`
- `APP_FEATURE_PWA_ENABLED`

PWA build args (ВАЖНО: это build-time, не runtime):
- `VITE_TELEGRAM_BOT_USERNAME`
- `VITE_PWA_URL`
- `VITE_BASE_PATH`
- `VITE_API_BASE_URL`

Web Push (опционально):
- `WEB_PUSH_ENABLED`
- `WEB_PUSH_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

SQLite tuning:
- `SPRING_DATASOURCE_URL` (с `busy_timeout` + `journal_mode=WAL`)
- `DB_POOL_MAX_SIZE`
- `DB_POOL_MIN_IDLE`
- `DB_CONNECTION_TIMEOUT_MS`

Backup scheduler:
- `APP_BACKUP_ENABLED`
- `APP_BACKUP_CRON`
- `APP_BACKUP_ZONE`
- `APP_BACKUP_RETENTION_DAYS`

## 4. Локальный запуск

Backend:
```bash
cd /Users/nikitapronin/projects/study/plant-bot
./gradlew bootRun
```

Mini App build:
```bash
cd /Users/nikitapronin/projects/study/plant-bot/plant-care-mini-app
npm ci
npm run build
```

PWA build:
```bash
cd /Users/nikitapronin/projects/study/plant-bot/plant-care-pwa
npm ci
npm run build
```

## 5. Проверки перед merge/release

Минимум:
```bash
cd /Users/nikitapronin/projects/study/plant-bot
./gradlew clean test

cd /Users/nikitapronin/projects/study/plant-bot/plant-care-mini-app
npm run build

cd /Users/nikitapronin/projects/study/plant-bot/plant-care-pwa
npm run build
```

Smoke-check вручную:
- login (Telegram/PWA)
- список растений и карточка
- отметка полива
- календарь
- AI chat, identify, diagnose
- настройки моделей OpenRouter
- admin panel + push test + backups

## 6. Deploy через Portainer

Рекомендуется:
- build в Portainer через `build.context` + `build.args` (чтобы PWA env baked-in был корректный)
- volume для `./data` обязателен
- через nginx проксировать:
  - `/api/` -> backend
  - `/mini-app/` -> static mini app
  - `/pwa/` -> static pwa

Важно:
- переменные `VITE_*` не работают как runtime env в браузере; их нужно передавать на этапе build.

## 7. Частые проблемы и решение

1. "Не задан VITE_TELEGRAM_BOT_USERNAME"
- причина: фронт собран без `VITE_TELEGRAM_BOT_USERNAME`
- решение: пересобрать контейнер с build arg `VITE_TELEGRAM_BOT_USERNAME`.

2. SQLite `database is locked`
- причина: конкурентные write-операции + неподходящий пул
- решение: WAL + busy timeout + минимальный pool + избегать долгих транзакций.

3. OpenRouter 429
- причина: rate-limit free-моделей
- решение: fallback model chain, retry/backoff, BYOK ключ пользователя.

4. Белый экран frontend
- проверить browser console + network
- проверить что `/pwa/` и `/mini-app/` реально отдаются
- проверить корректный `VITE_BASE_PATH`.

## 8. Стандарты код-изменений

Backend:
- контроллеры только thin layer
- бизнес-логика в `service`
- валидация входов
- никаких секретов в response/logs

Frontend:
- API calls только через `lib/api.ts`
- store только через Zustand слой
- platform-specific UI через адаптивные компоненты

Infra:
- изменения env обязательно документировать в `README.md` и `.env.example`
- миграции/резервные копии согласовывать до деплоя

## 9. Production readiness checklist

- [ ] Установлен `APP_SECURITY_JWT_SECRET` (не default)
- [ ] CORS ограничен реальными доменами
- [ ] Работает backup и есть restore-процедура
- [ ] Проверен вход Telegram Widget
- [ ] Проверены OpenRouter модели (chat/photo)
- [ ] Проверена админка (RBAC + push test)
- [ ] Проверен fallback при недоступности внешних API
- [ ] Проверены оба фронта на мобильных устройствах

