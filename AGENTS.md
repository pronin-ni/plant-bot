# AGENTS.md — Plant Care Platform

> **MCP Servers**: Config is in `opencode.json`.
> - **context7**: up-to-date library docs. Requires `CONTEXT7_API_KEY` (free at context7.com/dashboard)
> - **playwright**: browser automation + console/network logs capture
> - **filesystem**: file operations (restricted to project directory)
> - **git**: git operations (clone, commit, push, branch, etc.)
> - **fetch**: web content fetching (HTML to markdown conversion)

> **Skills**: Located in `.agents/skills/` for specialized tasks:
> ui-functional-testing, browser-automation, mobile-ux-audit, frontend-debugging,
> bug-fixing, react-ui-refactor, product-ux-review, form-flow-testing,
> state-and-api-testing, regression-checking

## 1. Build/Lint/Test Commands

### Backend (Spring Boot / Java 17 / Gradle)

```bash
# Compile
./gradlew compileJava

# Run all tests
./gradlew test

# Run single test class
./gradlew test --tests "com.example.plantbot.SomeTestClass"

# Run single test method
./gradlew test --tests "com.example.plantbot.SomeTestClass.methodName"

# Build JAR
./gradlew clean build

# Run locally
./gradlew bootRun

# Health check
curl -sS http://localhost:8080/actuator/health
```

### PWA Frontend (React 19 / TypeScript / Vite)

```bash
cd plant-care-pwa

# Install dependencies
npm ci

# Development
npm run dev

# Development with API audit mode
npm run dev:audit

# Type check
tsc -b

# Build for production
npm run build

# Preview production build
npm run preview
```

### Full Pre-commit Validation

```bash
cd /Users/nikitapronin/projects/study/plant-bot
./gradlew clean test
cd plant-care-pwa && npm run build
```

---

## 2. Backend Code Style (Java / Spring Boot)

### Architecture
- Controllers: thin layer, delegate to services
- Business logic: `service/` package
- Domain entities: `domain/` package (JPA)
- Repositories: `repository/` package
- DTOs: `controller/dto/` package
- Sub-packages for integrations: `service/ha/`, `service/weather/`

### Imports
- Use specific imports, avoid wildcard imports
- Group by: `java.*` → `javax.*` → `org.*` → `com.*`
- Spring imports first, then third-party, then project

```java
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.PlantService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
```

### Naming Conventions
- Classes: PascalCase (`PlantCatalogService`, `WateringLog`)
- Methods: camelCase (`getPlantById`, `calculateNextWateringDate`)
- Constants: SCREAMING_SNAKE_CASE
- Packages: lowercase (`service.ha` for Home Assistant)
- DTOs: suffix with `Request`/`Response`

### Lombok & Annotations
- Use Lombok: `@Service`, `@RequiredArgsConstructor`, `@Slf4j`, `@Getter`, `@Setter`
- Controllers: `@RestController`, `@RequestMapping`
- HTTP methods: `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`
- Validation: `@Valid`, `@NotNull`, `@NotBlank`

### Error Handling
- Return `ResponseEntity<?>` with appropriate HTTP status
- Use `@PreAuthorize("hasRole('ADMIN')")` for admin endpoints
- Log with `@Slf4j`: `log.error("message", ex)`
- Never log secrets, tokens, or user credentials
- Throw `ResponseStatusException` for simple HTTP errors

### Database (SQLite)
- Hibernate with `ddl-auto: update`
- Keep pool minimal: `maximum-pool-size: 1-4` (SQLite write locks)
- Use `@Transactional` for write operations
- Avoid long transactions to prevent `database is locked`

### Security
- Never expose secrets in responses or logs
- Validate ownership for plant-scoped operations
- Keep `/api/admin/**` protected with `ROLE_ADMIN`
- Store sensitive tokens encrypted (see `AesTokenCryptoService`)

---

## 3. Frontend Code Style (TypeScript / React 19)

### Architecture
- Screens: `app/` directory (flat or nested by feature)
- Components: `components/` directory
- State: Zustand store in `lib/store.ts`
- API: single wrapper in `lib/api.ts`
- Types: `types/` directory
- Utils: `lib/` directory

### Imports
- Use path aliases: `@/` maps to `src/`
- Order: React → external libs → internal components → local utils → types
- Use `import type {}` for type-only imports

```typescript
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlantCard } from '@/components/PlantCard';
import type { PlantDto } from '@/types/api';
```

### Naming Conventions
- Components: PascalCase files (`PlantsList.tsx`, `PlantCard.tsx`)
- Hooks: camelCase, prefix with `use` (`useOpenRouterModels.ts`)
- Utils: camelCase (`cn.ts`, `date.ts`, `motion.ts`)
- Types/Interfaces: PascalCase, suffix DTOs with `Dto`

### TypeScript Configuration
- Strict mode enabled (`strict: true`)
- `noUnusedLocals: false` (allows unused vars)
- `noUnusedParameters: true`
- Avoid `any`; use `unknown` with type guards

### State Management
- Server state: TanStack Query (`useQuery`, `useMutation`)
- Client state: Zustand (`useAuthStore`, `useOfflineStore`, `useUiStore`)
- Avoid prop drilling beyond 2 levels

### Styling (Tailwind CSS)
- Use shadcn/ui components as base
- Tailwind with CSS variables for theming
- Platform variants: `ios:`, `android:`, `pwa:`
- iOS-style custom classes: `text-ios-large-title`, `rounded-ios-card`
- Use `clsx` + `tailwind-merge` for conditional classes

### Error Handling
- Handle loading/error states in components
- Show user-friendly error messages
- Use React Query's `onError` for mutations

### Offline Support
- API calls through `lib/api.ts` (includes offline queue)
- Mutations queued in IndexedDB via `lib/indexeddb.ts`
- Never bypass the API layer for data fetching

---

## 4. Project-Specific Conventions

### API Contract Changes
When changing backend DTOs:
1. Update backend DTO in `controller/dto/`
2. Update frontend types in `types/api.ts`
3. Update `lib/api.ts`
4. Keep frontend in sync

### Home Assistant Integration
- HA is optional; gracefully degrade when not configured
- HA blocks should be hidden when connection not set up
- Tokens stored encrypted on backend

### OpenRouter / AI Features
- API key stored server-side; requests go through backend
- Free models shown by default; paid models behind checkbox
- Photo models filtered by `supportsImageToText=true`
- Cache AI responses to reduce costs

### Feature Flags
- `APP_FEATURE_PWA_ENABLED` — PWA routes
- Backend API remains available regardless of UI flags

### Environment Variables
- Backend: `.env.example` documents all vars
- PWA: `VITE_*` vars are **build-time only**
- Document new env vars in `.env.example`

---

## 5. Safe Modification Rules

1. **Never modify/delete user data** in `data/` without explicit request
2. **Avoid destructive git commands** (force push, hard reset)
3. **Isolate feature changes** to minimal commits
4. **Verify builds pass** after changes (backend + PWA)
5. **Preserve offline queue semantics** in `lib/api.ts`
6. **Keep DTOs synchronized** across backend and frontends
7. **Never hardcode secrets** in frontend code
8. **Check SQLite pool settings** when adding concurrent operations
9. **Test HA integration** when modifying sensor data flows

---

## 6. Directory Structure

```
plant-bot/
├── src/main/java/com/example/plantbot/
│   ├── controller/         # REST controllers + DTOs
│   │   └── dto/            # Request/Response DTOs
│   ├── service/             # Business logic
│   │   ├── ha/             # Home Assistant integration
│   │   ├── auth/           # Auth providers
│   │   └── weather/        # Weather providers
│   ├── domain/             # JPA entities
│   │   └── ha/             # HA-specific entities
│   ├── repository/         # JPA repositories
│   ├── security/           # JWT, filters
│   ├── config/             # Spring configuration
│   └── util/               # Utility classes
└── plant-care-pwa/         # PWA (React 19 + Vite + TS)
    └── src/
        ├── app/            # Screens/pages
        ├── components/     # Reusable components
        ├── lib/            # Utils, API, store
        └── types/          # TypeScript types
```
