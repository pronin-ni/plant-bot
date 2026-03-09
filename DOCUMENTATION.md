# DOCUMENTATION

## Project Overview
Plant Bot is a plant care assistant consisting of a Spring Boot backend and two React 19 frontends (PWA + Telegram mini-app). It manages plants, watering schedules, weather-aware reminders, AI diagnostics via OpenRouter, calendar sync, push notifications, exports/backups, and an admin dashboard.

## System Architecture
```
PWA / Mini‑app (React 19, Vite)
            ↓ REST/JSON + WebPush
Spring Boot (monolith, modular layering)
            ↓ JPA (Hibernate) / JDBC
SQLite (file DB, backup/restore)
External: Open-Meteo/WeatherAPI/Tomorrow.io/OWM, OpenRouter AI, Home Assistant, Telegram, Web Push
```
- **Architecture style:** Modular monolith with layered design (controller → service → repository → entity).
- **Frontends** talk to REST controllers; auth via JWT (PWA) or Telegram init-data (mini-app); web push uses VAPID.
- **Security:** Spring Security stateless JWT, role-based (ROLE_USER, ROLE_ADMIN), dev-auth toggle for local.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind, shadcn/ui, Framer Motion, Zustand, TanStack Query/Table, Recharts, Workbox service worker.
- **Backend:** Java 21, Spring Boot, Spring Web/Security/Data JPA, Hibernate, SQLite, Jasypt/AES crypto, Jackson, Validation.
- **AI/ML:** OpenRouter vision/text models (qwen2 presets), image upload.
- **Weather:** Provider-agnostic service with Open-Meteo + WeatherAPI + Tomorrow.io + OpenWeatherMap.
- **Notifications:** Web Push (VAPID), Telegram bot hooks, scheduled jobs.
- **Build/Infra:** Gradle, Dockerfile multi-stage, docker-compose, npm for frontends.
- **Testing:** JUnit/Mockito (backend), Playwright smoke scripts (manual in /tmp/pw-smoke), React Testing Library (sparse).

## Repository Structure
- `/src/main/java/com/example/plantbot` — backend code
  - `controller` — REST controllers (PWA, MiniApp, Admin, Weather, OpenRouter, HA, Push, Auth, Achievements, Calendar)
  - `service` — business logic (plants, watering, learning, weather, AI, HA, auth, admin, backup, notifications)
  - `repository` — Spring Data JPA repositories
  - `model` — entities, DTOs, enums, mappers
  - `config` — security, CORS, schedulers, crypto, OpenRouter, Swagger
- `/plant-care-pwa` — PWA frontend (React/Vite)
  - `src/app` — screens (Home/Plants, Calendar, AddPlant, AIAssistant, Settings, Admin, Achievements)
  - `src/components` — UI building blocks (adaptive nav, cards, settings accordions, admin tables, charts)
  - `src/lib` — API client, store (Zustand), themes, utils, offline queue (indexeddb)
  - `src/types` — shared API types
- `/plant-care-mini-app` — Telegram mini-app frontend (lightweight)
- `/data` — sample SQLite database / backups
- `Dockerfile`, `docker-compose*.yml` — container build/run
- `*.md` — documentation

## Backend Documentation
### Layers
- **Controllers:** map REST endpoints, validate input, convert to DTOs.
- **Services:** domain logic (watering recommendations, AI routing, weather fetch/cache, HA integration, admin analytics, auth/JWT, notifications, backups).
- **Repositories:** Spring Data JPA interfaces for entities (User, Plant, WateringLog, etc.).
- **Models/DTOs:** request/response payloads; enums for categories, placements, weather providers; crypto wrappers.

### Key Controllers / Endpoints (non-exhaustive)
- `PwaAuthController` — `/api/pwa/auth/providers`, `/telegram`, `/widget`, `/oauth/{provider}`, `/me`
- `PwaPushController` — `/api/pwa/push/public-key`, `/status`, `/subscribe`
- `PwaMigrationController` — migration status/analytics `/api/pwa/migration/*`
- `MiniAppController` — plants CRUD, watering, stats, learning, calendar ICS, assistant chat (TMA routes under `/api/miniapp/*`)
- `WeatherController` — `/api/weather/providers`, `/current?city=`, `/forecast?city=` uses selected provider from user settings
- `OpenRouterSettingsController` — `/api/openrouter/models`, `/preferences`, `/api-key`
- `OpenRouterAiController` — plant identify/diagnose via OpenRouter
- `HomeAssistantController` — HA connections, rooms/sensors, bindings, history
- `AchievementController` — `/api/user/achievements`, `/check`
- `AdminController` — `/api/admin/*` stats, users, plants, cache, backups, push test, logs, monitoring
- `CalendarController` — `/api/calendar/ics` generation, sync tokens
- `NotificationController` (web push) — subscriptions, test sends

### Entities (selected)
- `User` (roles, weatherProvider, city/lat/lon, openRouter preferences & encrypted apiKey, calendar token, flags)
- `Plant` (name, category/type/placement, lastWateredDate, baseIntervalDays, preferredWaterMl, photoUrl, owner)
- `WateringLog`, `AssistantChatHistory`, `AuthIdentity`, `WebPushSubscription`
- `PlantDictionaryEntry/Alias`, `PlantDuplicateMergeTask`
- `OpenRouterCacheEntry`, `PlantConditionSample`, `PlantAdjustmentLog`

### Security
- JWT Bearer for PWA; Telegram init-data for mini-app; `ROLE_ADMIN` guarded endpoints; dev-auth toggle (`APP_DEV_AUTH_ENABLED`) for local use; CORS from env; rate limits in admin; AES/Jasypt encryption for secrets.

## Frontend Documentation (PWA)
- **Entry:** `plant-care-pwa/src/main.tsx` → `App.tsx` defines tabbed navigation.
- **State:** Zustand store in `src/lib/store.ts`; API wrapper `src/lib/api.ts` with fetch helpers and offline queue.
- **Routing:** tabs (Plants/Home, Calendar, Add, AI, Settings, Admin) via custom nav; detail pages use React Router-like dynamic components.
- **Settings:** components in `src/components/settings*` and `src/app/Settings`; accordions per section; weather provider selector; HA/OpenRouter forms; export/import; achievements; stats; notifications; haptics.
- **Admin:** `src/app/Admin` uses TanStack Table for users/plants, backup list, push test.
- **Styling/UX:** Tailwind + shadcn/ui; Framer Motion animations; glassmorphism theme; service worker for PWA.

## Data Flow
```
User → PWA/Mini-app UI (Zustand state) → REST call via api.ts → Spring Controller → Service → Repository → SQLite
Response → Service → Controller → api.ts → UI state → Components
WebPush/Telegram/Calendar → async callbacks → controllers → services → repo
```

## Environment Configuration
Backend (`.env.example`): database path, JWT secret/TTL, TELEGRAM tokens, APP_DEV_AUTH_ENABLED, TELEGRAM_BOT_ENABLED, OPENROUTER_API_KEY (optional), OPENWEATHER_API_KEY, VAPID_PUBLIC/PRIVATE, CORS origins, BACKUP paths/cron, PUBLIC_BASE_URL, APP_PORT/SERVER_PORT.

Frontend PWA (`plant-care-pwa/.env.example`): `VITE_API_BASE_URL`, `VITE_PWA_URL` (mini-app uses), optional feature flags.

## Setup Guide
1. Clone: `git clone ... && cd plant-bot`
2. Backend: `APP_DEV_AUTH_ENABLED=true TELEGRAM_BOT_ENABLED=false ./gradlew bootRun`
3. Frontend PWA: `cd plant-care-pwa && VITE_API_BASE_URL=http://localhost:8080 npm install && npm run dev -- --host --port 5173`
4. Mini-app: `cd plant-care-mini-app && VITE_API_BASE_URL=http://localhost:8080 npm install && npm run dev`
5. Open `http://localhost:5173/pwa/`

## Development Guide
- **Add API endpoint:** Controller (request/response DTO + validation) → Service method → Repository/entity changes → Security config if needed → tests.
- **Add service logic:** extend service, keep transactions in service layer, validate inputs.
- **Add frontend page:** create component in `src/app`, wire state with store/api, add to navigation, style via shadcn/ui.
- **Add setting:** new accordion item, API call through `lib/api.ts`, optimistic UI + toasts.

## Testing Guide
- Backend: `./gradlew test`
- Frontend: `npm test` (if configured) or component-level with RTL; Playwright smoke scripts in `/tmp/pw-smoke` (see summary) using `PAGE_BASE` and `API_BASE`.

## AI Assistant Notes
- Project is layered; prefer service changes over controller logic.
- Check env flags: dev-auth and Telegram bot may alter auth flows.
- SQLite file in `data/` — keep migrations in sync.
- When touching OpenRouter/weather providers, ensure backend enum + frontend selector match and free-tier endpoints.
