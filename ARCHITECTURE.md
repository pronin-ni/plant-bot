# ARCHITECTURE

## High-Level View
```
Users (Web + Telegram Mini-App)
        ↓
React 19 Frontends (PWA, Mini-App)
        ↓ REST/JSON + WebPush
Spring Boot Monolith (Controllers → Services → Repos)
        ↓ JPA (Hibernate)
SQLite DB (file) + Backups
External: Open-Meteo/WeatherAPI/Tomorrow.io/OWM, OpenRouter AI, Home Assistant, Telegram, Web Push (VAPID)
```

## Layered Architecture
- **Presentation:** React clients (Vite) with Zustand state; shadcn/ui components; service worker for offline/push.
- **API Layer:** Spring `@RestController` classes handle HTTP, validation, DTO mapping.
- **Business Layer:** Services encapsulate domain logic (plants, watering recs, weather routing, AI selection, HA sync, admin analytics, auth/JWT, notifications, backups).
- **Data Access:** Spring Data JPA repositories over SQLite entities; occasional native queries/caching.
- **Integration:** HTTP clients for weather providers, OpenRouter, Telegram, Home Assistant; WebPush sender; Backup scheduler.
- **Security:** JWT stateless auth; Telegram init-data verification; role-based guards; AES/Jasypt secrets; CORS configured.

## Module Map (Backend)
- `controller` — PWA/MiniApp/Admin/Auth/Push/Weather/OpenRouter/HA/Calendar/Achievements endpoints.
- `service` — domain services (PlantService, WateringRecommendationService, LearningService, WeatherService, OpenRouter* services, HomeAssistantIntegrationService, AdminService, NotificationService, BackupScheduler, Auth/Jwt services).
- `repository` — JPA interfaces for entities.
- `model` — entities + DTOs + enums (PlantCategory/Placement/Type, WeatherProvider, Roles, etc.).
- `config` — SecurityConfig, WebConfig, OpenRouterConfig, CryptoConfig, SchedulerConfig, Swagger.

## Module Map (Frontend PWA)
- `src/app` — feature screens (Plants, Calendar, AddPlant, AI Assistant, Settings, Admin, Achievements, PlantDetail).
- `src/components` — shared UI (cards, tables, charts, settings accordions, admin widgets, nav, forms).
- `src/lib` — `api.ts` HTTP layer, `store.ts` Zustand state, `indexeddb.ts` offline queue, theming, utils.
- `src/types` — API typings.
- `sw.js` — Workbox service worker.

## Dependency Relationships
- Controllers depend on Services and DTO mappers.
- Services depend on Repositories and external clients (weather, OpenRouter, HA, push, telegram).
- Repositories depend on JPA Entities.
- Frontend components consume `lib/api.ts` + Zustand store; feature screens compose components; admin tables use TanStack Table.

## Data Flow (Detailed)
```
User action
→ Frontend component dispatch (Zustand) / api.ts fetch
→ HTTP request (JWT or Telegram init-data)
→ Controller (validation)
→ Service (business rules, scheduling, AI/Weather provider choice)
→ Repository (DB) and/or external API
→ Service response
→ Controller response JSON
→ api.ts resolves → Zustand store → UI renders/animates

Push/Calendar/Telegram callbacks
→ Dedicated controller → service → repo → async notification
```

## Domain Model (Primary Entities)
- **User**: id, username, roles, city/lat/lon, weatherProvider, calendarToken, openRouterPrefs (vision/text models, encrypted apiKey), auth identities, flags.
- **Plant**: id, owner, category/type/placement, lastWateredDate, baseIntervalDays, preferredWaterMl, photoUrl, alerts.
- **WateringLog**: timestamp, volume, source (manual/ai/bulk), nextDue.
- **AssistantChatHistory**: user, role, message, media.
- **AuthIdentity**: telegramId/provider, user link.
- **WebPushSubscription**: endpoint, keys, user.
- **PlantDictionaryEntry/Alias**: reference data for plant names.
- **PlantConditionSample/AdjustmentLog**: HA telemetry + adaptive learning.
- **OpenRouterCacheEntry**: cached AI results.

## External Integrations
- **Weather**: Open-Meteo (no key), WeatherAPI/Tomorrow.io/OWM (public keys on backend), provider chosen per user; forecast/current endpoints.
- **AI (OpenRouter)**: model catalog, validation, plant identify/diagnose; auto vision/text model selection.
- **Home Assistant**: multiple instances, room/sensor listing, plant binding, history fetch.
- **Calendar**: ICS feed + QR; sync tokens; test event.
- **Notifications**: WebPush (VAPID); Telegram bot optional.
- **Backups**: SQLite backup/restore, cron, Telegram cloud storage (planned).

## Key Entry Points
- Backend: `PlantBotApplication` main class.
- Frontend PWA: `plant-care-pwa/src/main.tsx` and `src/app/App.tsx`.
- Mini-app: `plant-care-mini-app/src/main.tsx`.

## Deployment / Build
- **Backend:** Gradle `bootRun`; Dockerfile builds frontends then Spring Boot fat jar.
- **Frontends:** `npm run build` in respective folders; served statically via Spring or docker-compose Nginx depending on compose config.
- **Configs:** `docker-compose.yml` wires app, database volume, optional Nginx; `.env` controls keys/ports.

## Risks / Sensitive Areas
- Encryption of API keys (OpenRouter, HA tokens) — use provided crypto services.
- Auth flows differ between PWA (JWT) and mini-app (telegram init data); respect guards.
- Weather provider enums must stay aligned backend ↔ frontend.
- Admin actions require `ROLE_ADMIN` and double confirmations; keep logging.
