# Development Guide

This guide describes practical workflows for extending the project safely.

## 1. Local Setup

### Backend

```bash
cp .env.example .env
./gradlew bootRun
```

### PWA frontend

```bash
cd plant-care-pwa
cp .env.example .env
npm install
npm run dev
```

### Mini App frontend

```bash
cd plant-care-mini-app
cp .env.example .env
npm install
npm run dev
```

## 2. How to Add a New Backend Endpoint

1. Add request/response DTOs under:
   - `src/main/java/com/example/plantbot/controller/dto/...`
2. Add service logic under:
   - `src/main/java/com/example/plantbot/service/...`
3. Add repository query (if needed) under:
   - `src/main/java/com/example/plantbot/repository/...`
4. Expose endpoint in controller under:
   - `src/main/java/com/example/plantbot/controller/...`
5. Add authorization rule:
   - `@PreAuthorize` and/or role checks.
6. Add structured logging for admin/critical operations.
7. Update frontend API client and types.
8. Validate with manual smoke calls.

### Minimal controller pattern

- Validate payload early.
- Resolve authenticated user (`CurrentUserService` or JWT principal).
- Delegate to service.
- Return DTO, not entity.

## 3. How to Add a New Service

1. Create class in `service` package.
2. Inject dependencies via constructor (`@RequiredArgsConstructor`).
3. Keep orchestration in service; keep controllers thin.
4. Mark transactional boundaries where needed (`@Transactional`).
5. Avoid direct HTTP logic in controllers; keep external calls in service.

## 4. How to Add a New Frontend Page

1. Add screen component in `plant-care-pwa/src/app/<Feature>/`.
2. Create/extend shared components in `plant-care-pwa/src/components/`.
3. Wire tab/shell integration in `plant-care-pwa/src/app/App.tsx`.
4. Add API contract in:
   - `plant-care-pwa/src/types/api.ts`
   - `plant-care-pwa/src/lib/api.ts`
5. Keep mutations resilient to offline behavior if user-facing critical.

## 5. How to Add a New UI Component

1. Prefer reusable component in `src/components`.
2. Keep presentational components stateless where possible.
3. Place side-effects and data-fetching in screen/container components.
4. Reuse existing style primitives (`src/components/ui`, `cn` utility).

## 6. Security Checklist (Mandatory)

For any API that changes state or exposes sensitive data:

- Verify user identity (JWT or telegram init-data path).
- Verify ownership/role (`ROLE_ADMIN` for admin paths).
- Validate all IDs and enums.
- Add confirmation for destructive admin actions on frontend.
- Log actor + target for admin actions.
- Never return encrypted tokens or secrets in responses.

## 7. Data Model Changes

Current persistence is JPA + SQLite with `ddl-auto: update`.

When adding fields:

1. Update entity class.
2. Check if SQLite requires manual ALTER fallback (`SqliteSchemaInitializer`).
3. Update DTO mapping and API clients.
4. Validate backward compatibility with existing rows.

## 8. Weather / AI / HA Integration Notes

- Weather provider is stored in `User.weatherProvider`.
- OpenRouter key is encrypted using local AES key file.
- Home Assistant token is encrypted similarly in HA module.
- For external API failures, return graceful fallback responses where possible.

## 9. Manual Validation Flow

Run these after changes:

1. Backend compilation:

```bash
./gradlew clean compileJava
```

2. Frontend builds:

```bash
cd plant-care-pwa && npm run build
cd ../plant-care-mini-app && npm run build
```

3. Basic API smoke checks (example):

```bash
curl -sS http://localhost:8080/actuator/health
curl -sS http://localhost:8080/api/pwa/auth/providers
```

## 10. Current Testing Status

- Automated unit/integration/e2e tests are minimal/absent in repository.
- `./gradlew test` runs but there are no substantial backend test suites.
- Frontend has no active test runner setup in current codebase.

Recommended next step: add JUnit service tests + controller integration tests first.

## 11. Git and Change Scope Rules

- Keep backend/frontend API contracts synchronized in one PR.
- Avoid unrelated formatting changes in large files.
- For admin/security changes, include explicit risk notes in PR description.
- Update docs (`README.md`, `DOCUMENTATION.md`, `AI_CONTEXT.md`) when behavior changes.
