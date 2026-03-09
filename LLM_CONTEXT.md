# LLM_CONTEXT
Guidance for AI assistants working on the Plant Bot repo.

## Project Overview
Plant care platform: Spring Boot backend + React PWA + Telegram mini-app. Features: plant management, weather-aware schedules, AI plant diagnostics via OpenRouter, calendar sync, web push, exports/backups, admin dashboard.

## Architecture Summary
Modular monolith. Layers: controllers → services → repositories → entities. Frontends consume REST/JSON + WebPush. SQLite database. External integrations: weather providers (Open-Meteo default), OpenRouter AI, Home Assistant, Telegram, VAPID WebPush.

## Repository Map
- `/src/main/java/com/example/plantbot` — backend (controllers, services, repositories, models, config)
- `/plant-care-pwa` — PWA React app (src/app pages, src/components, src/lib api/store, src/types)
- `/plant-care-mini-app` — Telegram mini-app React
- `/data` — SQLite DB/backups samples
- `Dockerfile`, `docker-compose*.yml` — build/run
- Docs: README.md, DOCUMENTATION.md, ARCHITECTURE.md, DEVELOPMENT_GUIDE.md, AI_CONTEXT.md, PROJECT_MAP.md

## Key Modules
- **Backend controllers:** PWA auth/push/migration, mini-app, weather, openrouter, home-assistant, achievements, admin, calendar, notifications.
- **Backend services:** PlantService, WateringRecommendationService, LearningService, WeatherService (provider routing/cache), OpenRouter* services, HomeAssistantIntegrationService, AdminService/Insights, NotificationService, BackupScheduler, Auth/Jwt services.
- **Frontends:** PWA screens (Plants, Calendar, Add, AI, Settings, Admin, Achievements); components (settings accordions, admin tables, charts); Zustand store; api.ts wrapper.

## Important Files
- Backend main: `src/main/java/.../PlantBotApplication.java`
- Security: `config/SecurityConfig.java`, JWT utilities, Telegram init verification
- Weather: `service/weather/*`, `controller/WeatherController.java`
- OpenRouter: `service/openrouter/*`, `controller/OpenRouter*`
- HA: `controller/HomeAssistantController.java`, `service/ha/*`
- Admin: `controller/admin/AdminController.java`
- Frontend entry: `plant-care-pwa/src/main.tsx`, `src/app/App.tsx`
- API client: `plant-care-pwa/src/lib/api.ts`
- State: `plant-care-pwa/src/lib/store.ts`

## Common Development Tasks
- **Add endpoint:** create DTO + controller method → service logic → repo/entity if needed → security config → tests.
- **Add frontend feature/page:** add screen under `src/app`, API call via `lib/api.ts`, manage state in `store.ts`, add navigation, style with shadcn/ui.
- **Add setting:** backend config + endpoint; frontend accordion item + optimistic UI.
- **AI/Weather changes:** update backend enums + service routing; mirror choices in frontend selectors.

## Coding Patterns
- Spring layered architecture; validation annotations; service-only transactions; repositories are thin.
- Frontend uses composition, Zustand for global state, shadcn/ui for UI, Framer Motion for motion, TanStack Table for admin lists.

## Safe Modification Rules
- Keep encryption/crypto services intact when touching secrets (OpenRouter/HA tokens).
- Preserve auth flows (JWT vs Telegram); admin endpoints require role + confirmations.
- Align enums/DTOs across backend and frontend.
- Avoid committing large SQLite dbs; use backups directory.

## Typical Feature Flow
1) Define/extend entity + repository if persistence is needed.
2) Implement service logic; add tests.
3) Expose via controller DTO; secure with roles.
4) Consume from frontend via `api.ts`; update store/components; add loading/error states.
5) Update docs if surface area changes.
