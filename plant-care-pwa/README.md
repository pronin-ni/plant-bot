# Plant Care PWA

Этап 0-1 миграции с TMA на PWA:
- подключен `vite-plugin-pwa`
- добавлен `manifest.json`
- добавлен `sw.js` (Workbox, базовый offline cache)
- настроена регистрация Service Worker в `src/lib/pwa.ts`
- добавлена модульная auth-архитектура на фронте (`src/lib/auth/authProviders.ts`)
- добавлен экран логина (`src/app/auth/LoginScreen.tsx`) и PWA JWT-сессия
- добавлены backend endpoints:
  - `GET /api/pwa/auth/providers`
  - `POST /api/pwa/auth/telegram`
  - `POST /api/pwa/auth/oauth/{provider}`
  - `GET /api/pwa/auth/me`

## Локальный запуск (dev)

```bash
cd plant-care-pwa
npm install
npm run dev
```

## Продакшен-сборка (генерация PWA)

```bash
npm run build
```

Результат: `dist/`.

## Что кэшируется оффлайн

- HTML-навигация (`NetworkFirst`)
- `GET /api/**` (`NetworkFirst`, короткий TTL)
- JS/CSS/worker (`StaleWhileRevalidate`)
- изображения/шрифты (`StaleWhileRevalidate`)

## Переменные

- `VITE_API_BASE_URL` — URL Java backend (пример: `https://api.example.com`)
- `VITE_BASE_PATH` — базовый путь PWA (по умолчанию `/`)

## Минимальные backend endpoints

- `POST /api/auth/validate`
- `GET /api/plants`
- `GET /api/plants/{id}`
- `POST /api/plants`
- `PUT /api/plants/{id}/water`
- `POST /api/plants/{id}/photo`
- `GET /api/plants/search?q=...`
- `GET /api/calendar`
- `POST /api/users/city`

## Текущий режим миграции

- Telegram SDK сохранён: текущий фронт всё ещё умеет работать как TMA.
- На следующих этапах будет добавлена модульная авторизация для полноценного PWA режима (без Telegram).
