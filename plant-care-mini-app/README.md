# Plant Care Mini App

## Локальный запуск

```bash
cd plant-care-mini-app
npm install
npm run dev
```

## Продакшен-сборка

```bash
npm run build
```

Результат: `dist/`.

## Переменные

- `VITE_API_BASE_URL` — URL Java backend (пример: `https://api.example.com`)

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

## Telegram Mini App

- В BotFather указать WebApp URL на страницу, где размещен `dist/index.html`.
- Все запросы идут с заголовком `X-Telegram-Init-Data`.
