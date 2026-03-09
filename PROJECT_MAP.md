# PROJECT_MAP
Short map of directories and roles.

## Backend (/src/main/java/com/example/plantbot)
- `PlantBotApplication.java` — entry point
- `config/` — SecurityConfig, OpenRouterConfig, CryptoConfig, WebConfig, SchedulerConfig, Swagger
- `controller/` — REST endpoints
  - `pwa/` auth, push, migration
  - `miniapp/` telegram mini-app routes
  - `weather/` provider list/current/forecast
  - `openrouter/` models/preferences/api-key + AI identify/diagnose
  - `ha/` Home Assistant integration
  - `admin/` admin dashboard actions (stats, users, plants, cache, backups, push test, logs)
  - `calendar/` ICS + sync tokens
  - `achievement/`, `notification/`, etc.
- `service/` — business logic modules
  - plants/watering/learning/statistics
  - weather provider router/cache/geocode
  - openrouter model catalog, vision/text routing, crypto storage
  - home assistant integration/binding/history
  - auth/jwt/telegram verification
  - admin insights/monitoring/cache/backup, notification sender, backup scheduler
- `repository/` — Spring Data JPA repositories for entities
- `model/` — entities, DTOs, enums (PlantCategory/Placement/Type, WeatherProvider, Roles, etc.)

## Frontend PWA (/plant-care-pwa)
- `src/main.tsx`, `src/app/App.tsx` — entry + shell
- `src/app/` — feature screens: Plants, PlantDetail, Calendar, AddPlant, AIAssistant, Settings, Admin, Achievements
- `src/components/` — shared UI (cards, forms, tables, charts, settings accordions, admin widgets, nav)
- `src/lib/` — `api.ts` (fetch), `store.ts` (Zustand), `indexeddb.ts` (offline queue), theme/utils
- `src/types/` — API/shared types
- `sw.js` — service worker

## Frontend Mini-App (/plant-care-mini-app)
- `src/main.tsx` entry
- `src/app/` minimal views for Telegram
- `src/lib/api.ts` client

## Data / Config / Infra
- `/data` — SQLite DB/backups samples
- `.env.example` (backend), `plant-care-pwa/.env.example` (frontend), mini-app env
- `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`

## Tests / Scripts
- Backend tests under `src/test/java`
- Playwright smoke scripts (manual) referenced in `/tmp/pw-smoke`
- Gradle build scripts `build.gradle`, `settings.gradle`

## Quick Paths for AI
- Add endpoint: controller → service → repository/entity → security config
- Frontend API calls: `plant-care-pwa/src/lib/api.ts`
- Global state: `plant-care-pwa/src/lib/store.ts`
- Admin UI: `plant-care-pwa/src/app/Admin/*`
- Settings UI: `plant-care-pwa/src/app/Settings/*` + `src/components/settings*`
