# AGENTS.md — Plant Care Platform

> **MCP Servers** (config: `opencode.json`): context7, playwright, filesystem, git, fetch
> **Skills** (`.agents/skills/`): ui-functional-testing, browser-automation, mobile-ux-audit, frontend-debugging, bug-fixing, react-ui-refactor, product-ux-review, form-flow-testing, state-and-api-testing, regression-checking

---

## 1. Build/Lint/Test Commands

### Backend (Spring Boot / Java 17 / Gradle)

```bash
./gradlew compileJava                          # Compile
./gradlew test                                  # All tests
./gradlew test --tests "com.example.plantbot.SomeTestClass"           # Single class
./gradlew test --tests "com.example.plantbot.SomeTestClass.method"    # Single method
./gradlew clean build                           # Full build + tests
./gradlew bootRun                               # Run locally
curl -sS http://localhost:8080/actuator/health   # Health check
```

### PWA Frontend (React 19 / TypeScript / Vite)

```bash
cd plant-care-pwa
npm ci                                          # Install dependencies
npm run dev                                     # Dev server
npm run dev:audit                               # Dev with API audit mode
tsc -b                                          # Type check
npm run build                                   # Production build (tsc + vite)
npm run preview                                 # Preview production build
```

### Full Pre-commit Validation

```bash
./gradlew clean test && cd plant-care-pwa && npm run build
```

---

## 2. Backend Code Style (Java / Spring Boot)

### Architecture
- Controllers → thin layer, delegate to services
- Business logic in `service/` package
- Domain entities in `domain/` (JPA)
- DTOs in `controller/dto/` — suffix with `Request`/`Response`
- Integration sub-packages: `service/ha/`, `service/weather/`, `service/auth/`

### Imports
- Specific imports only, no wildcards
- Group: `com.example.*` → `java.*` → `javax.*`/`jakarta.*` → `org.*`
- Project imports first, then third-party

### Naming & Annotations
- Classes: PascalCase (`PlantCatalogService`)
- Methods: camelCase (`getPlantById`)
- Constants: SCREAMING_SNAKE_CASE
- Use Lombok: `@Service`, `@RequiredArgsConstructor`, `@Slf4j`
- Controllers: `@RestController`, `@RequestMapping`
- Validation: `@Valid`, `@NotNull`, `@NotBlank`

### Error Handling
- Return `ResponseEntity<?>` with appropriate HTTP status
- Use `@PreAuthorize("hasRole('ADMIN')")` for admin endpoints
- Log errors: `log.error("message", ex)` — never log secrets/tokens
- Throw `ResponseStatusException` for simple HTTP errors

### Database (SQLite)
- Hibernate `ddl-auto: update`, pool `maximum-pool-size: 1-4`
- Use `@Transactional` for write operations
- Avoid long transactions to prevent `database is locked`

### Security
- Never expose secrets in responses or logs
- Validate ownership for plant-scoped operations
- `/api/admin/**` requires `ROLE_ADMIN`
- Store sensitive tokens encrypted (`AesTokenCryptoService`)

---

## 3. Frontend Code Style (TypeScript / React 19)

### Architecture
- Screens: `app/` directory; Components: `components/`
- State: Zustand (`lib/store.ts`); API: `lib/api.ts`
- Types: `types/`; Utils: `lib/`

### Imports
- Path alias `@/` → `src/`
- Order: React → external libs → internal components → utils → types
- Use `import type {}` for type-only imports

### Naming
- Components: PascalCase files (`PlantsList.tsx`)
- Hooks: camelCase with `use` prefix (`useOpenRouterModels.ts`)
- Types/Interfaces: PascalCase, DTOs suffix `Dto`

### TypeScript
- Strict mode (`strict: true`), `noUnusedParameters: true`
- Avoid `any`; use `unknown` with type guards

### State & Styling
- Server state: TanStack Query (`useQuery`, `useMutation`)
- Client state: Zustand stores (`useAuthStore`, `useOfflineStore`, `useUiStore`)
- Tailwind CSS + shadcn/ui; use `clsx` + `tailwind-merge` for conditional classes
- Platform variants: `ios:`, `android:`, `pwa:`

### Offline Support
- All API calls through `lib/api.ts` (includes offline queue)
- Mutations queued in IndexedDB via `lib/indexeddb.ts`

---

## 4. Project-Specific Conventions

### API Contract Changes
When changing backend DTOs: update `controller/dto/` → `types/api.ts` → `lib/api.ts`

### Home Assistant Integration
- Optional; gracefully degrade when not configured
- HA blocks hidden when connection not set up

### OpenRouter / AI Features
- API key stored server-side; requests proxied through backend
- Free models shown by default; paid behind checkbox

### Environment Variables
- Backend: `.env.example` documents all vars
- PWA: `VITE_*` vars are **build-time only**

---

## 5. Safe Modification Rules

1. **Never modify/delete user data** in `data/` without explicit request
2. **Avoid destructive git commands** (force push, hard reset)
3. **Verify builds pass** after changes (backend + PWA)
4. **Keep DTOs synchronized** across backend and frontend
5. **Never hardcode secrets** in frontend code
6. **Check SQLite pool settings** when adding concurrent operations

---

## 6. Directory Structure

```
plant-bot/
├── src/main/java/com/example/plantbot/
│   ├── controller/     # REST controllers + dto/
│   ├── service/        # Business logic (+ ha/, auth/, weather/)
│   ├── domain/         # JPA entities (+ ha/)
│   ├── repository/     # JPA repositories
│   ├── security/       # JWT, filters
│   ├── config/         # Spring configuration
│   └── util/           # Utility classes
└── plant-care-pwa/     # React 19 + Vite + TS
    └── src/
        ├── app/        # Screens/pages
        ├── components/ # Reusable components
        ├── lib/        # Utils, API, store
        └── types/      # TypeScript types
```
