# AI Context

This file is optimized for AI assistants working on this repository.

## 1. Project Map

## Backend logic

- Root package: `src/main/java/com/example/plantbot`
- Controllers: `.../controller`
- Services: `.../service`, `.../service/ha`, `.../service/auth`
- Repositories: `.../repository`, `.../repository/ha`
- Entities/models: `.../domain`, `.../domain/ha`
- Security: `.../security`
- Config: `.../config`

## API

- Main business API: `MiniAppController`
- Admin API: `AdminController`
- Auth API: `PwaAuthController`
- Push API: `PwaPushController`
- Weather API: `WeatherController`
- OpenRouter API: `OpenRouterAiController`, `OpenRouterSettingsController`
- Home Assistant API: `HomeAssistantController`

## Database models

- Core: `User`, `Plant`, `WateringLog`, `AssistantChatHistory`
- Auth: `AuthIdentity`
- Weather/AI cache: `OpenRouterCacheEntry`, `PlantLookupCache`
- Push: `WebPushSubscription`
- HA: `HomeAssistantConnection`, `PlantHomeAssistantBinding`, `PlantConditionSample`, `PlantAdjustmentLog`

## Frontend components

- PWA app shell: `plant-care-pwa/src/app/App.tsx`
- PWA screens: `plant-care-pwa/src/app/*`
- PWA API wrapper: `plant-care-pwa/src/lib/api.ts`
- PWA state: `plant-care-pwa/src/lib/store.ts`
- PWA offline queue/cache: `plant-care-pwa/src/lib/indexeddb.ts`

- Mini App shell: `plant-care-mini-app/src/app/App.tsx`
- Mini App API wrapper: `plant-care-mini-app/src/lib/api.ts`

## Configuration

- Backend config: `src/main/resources/application.yml`
- Backend env example: `.env.example`
- Docker: `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`
- CI publish: `.github/workflows/docker-publish.yml`

## Tests

- No significant project tests currently found.

## 2. Safe Modification Rules

1. Keep DTO contracts synchronized between backend and both frontends.
2. For `/api/admin/**`, keep `ROLE_ADMIN` checks and audit logging.
3. Do not store raw tokens/keys; use existing crypto services.
4. Preserve ownership checks for plant-scoped operations.
5. Avoid changing `SecurityConfig` defaults without explicit requirement.
6. Do not break offline queue semantics in `plant-care-pwa/src/lib/api.ts`.
7. Do not hardcode secrets in frontend code.
8. Avoid broad refactors in one commit; isolate feature changes.

## 3. Typical Tasks

## Task: Add new endpoint

1. Add DTO(s) in `controller/dto`.
2. Add service method in `service`.
3. Add controller mapping in `controller`.
4. Add repository query if needed.
5. Add auth/ownership checks.
6. Add frontend type + API method.
7. Wire UI usage.

## Task: Change existing UI behavior

1. Locate screen in `plant-care-pwa/src/app`.
2. Locate shared components in `plant-care-pwa/src/components`.
3. If API contract changes, update `src/types/api.ts` + backend DTO.
4. Validate in both light/dark and offline cases where relevant.

## Task: Add feature touching backend + frontend

1. Start with backend contract (controller + DTO + service).
2. Update frontend API wrapper.
3. Update UI and local state.
4. Smoke test through real endpoint flow.
5. Document in `README.md`/`DOCUMENTATION.md`.

## 4. Contract Gaps to Keep in Mind

Frontend (`plant-care-pwa/src/lib/api.ts`) currently calls endpoints not present in backend:

- `POST /api/openrouter/validate-key`
- `POST /api/openrouter/send`
- `GET /api/export/pdf`
- `POST /api/import/{provider}`
- `POST /api/backup/telegram`

If a task touches these flows, backend implementation is required first.

## 5. Useful Validation Commands

```bash
# backend compile
./gradlew clean compileJava

# backend run
./gradlew bootRun

# pwa build
cd plant-care-pwa && npm run build

# mini app build
cd ../plant-care-mini-app && npm run build

# health check
curl -sS http://localhost:8080/actuator/health
```
