# AGENTS.md - Developer Guidelines for AI Agents

This document provides guidelines for AI coding agents working on this codebase.

---

## Project Overview

- **Type**: Full-stack monorepo (Java Spring Boot + React PWA)
- **Tech Stack**: 
  - Backend: Java 17, Spring Boot 3.2, JPA/Hibernate, SQLite
  - Frontend: React 19, TypeScript, Vite 7, Tailwind CSS, TanStack Query
- **Structure**: `src/` (backend) + `plant-care-pwa/` (frontend)

---

## Build Commands

### Backend (Java)

```bash
# Build JAR
./gradlew build

# Run application
./gradlew bootRun

# Run tests
./gradlew test

# Run single test
./gradlew test --tests "com.example.plantbot.service.SeedLifecycleServiceTest"
./gradlew test --tests "com.example.plantbot.controller.AppControllerLegacyAiRecommendTest"

# Run tests with verbose output
./gradlew test --info

# Clean and rebuild
./gradlew clean build
```

### Frontend (React/TypeScript)

```bash
cd plant-care-pwa

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Code Style Guidelines

### Backend (Java)

1. **Package organization**: `com.example.plantbot.{controller,service,repository,domain,config,security,util}`
2. **Imports**: 
   - Use fully qualified imports (no wildcard `.*`)
   - Order: java.* → javax.* → org.* → com.*
   - Static imports last
3. **Lombok**: Use `@Slf4j`, `@RequiredArgsConstructor`, `@Data` sparingly
4. **DTOs**: Create in `controller/dto/` package
5. **Entities**: Place in `domain/` package, use JPA annotations
6. **Methods**: Small, focused, <50 lines
7. **Error handling**: Use `@ExceptionHandler` in controllers, log with `log.error()`
8. **Testing**: JUnit 5, Mockito for mocking

### Frontend (React/TypeScript)

1. **File naming**: 
   - Components: `PascalCase.tsx` (e.g., `PlantCard.tsx`)
   - Utils/hooks: `camelCase.ts` (e.g., `usePlants.ts`)
2. **Imports**: Use absolute paths with `@/` alias (e.g., `@/lib/api`)
3. **Component structure**: 
   ```tsx
   import { useState, useEffect } from 'react';
   import { useQuery, useMutation } from '@tanstack/react-query';
   import { Button } from '@/components/ui/button';
   import type { PlantDto } from '@/types/api';

   interface Props {
     plantId: number;
     onClose: () => void;
   }

   export function PlantDetail({ plantId, onClose }: Props) {
     // hooks first
     // then render
   }
   ```
4. **State management**: Zustand for global state, React Query for server state
5. **Styling**: Tailwind CSS, use `cn()` utility from `lib/utils.ts`
6. **Types**: Define in `types/api.ts` for API DTOs, interfaces in component files for local types
7. **No comments**: Avoid comments unless explaining complex logic
8. **Error handling**: Use `onError` callbacks in mutations, show user feedback via haptics/toast

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Java classes | PascalCase | `PlantService.java` |
| Java methods | camelCase | `updatePlant()` |
| Java constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| React components | PascalCase | `<PlantCard />` |
| TypeScript interfaces | PascalCase | `PlantDto` |
| TypeScript functions | camelCase | `parseDateOnly()` |
| CSS classes (Tailwind) | lowercase | `flex items-center` |
| Database columns | snake_case | `pot_volume_liters` |

---

## API Development Guidelines

1. **Backend endpoints**: Add to `AppController.java` following REST conventions
2. **DTOs**: Create request/response DTOs in `controller/dto/`
3. **CORS**: Update `WebConfig.java` if adding new HTTP methods
4. **Frontend API**: Add functions to `lib/api.ts`
5. **Types**: Add TypeScript interfaces to `types/api.ts`
6. **Breaking changes**: Update both backend and frontend together

---

## Database

- **Engine**: SQLite with Hibernate community dialect
- **Schema**: Auto-generated from entities (hibernate.ddl_auto: update)
- **Migrations**: Not currently using Flyway/Liquibase - schema changes via entity modifications
- **Dev auth**: Enable with `APP_DEV_AUTH_ENABLED=true` or set in `application.yml`

---

## Common Patterns

### Backend - Service Layer
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class PlantService {
  private final PlantRepository plantRepository;
  
  public Optional<Plant> findById(Long id) {
    return plantRepository.findById(id);
  }
}
```

### Frontend - React Query Mutation
```tsx
const mutation = useMutation({
  mutationFn: (data: InputType) => apiCall(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['plants'] });
    hapticSuccess();
  },
  onError: () => {
    hapticError();
  }
});
```

---

## Testing Strategy

- **Backend**: Unit tests in `src/test/java/`, integration tests for controllers
- **Frontend**: Vitest configured but no tests currently written
- **Manual testing**: Use Playwright for E2E testing (already installed in project)

---

## Environment Variables

Required for running:
- `TELEGRAM_AUTH_TOKEN`
- `APP_SECURITY_JWT_SECRET`

Optional:
- `OPENROUTER_API_KEY`
- `OPENWEATHER_API_KEY`
- `WEB_PUSH_VAPID_*`

---

## Important Notes

1. **Do NOT commit secrets** - Use `.env` files, never commit `.env`
2. **API contracts** - Frontend and backend must stay in sync
3. **Mobile-first** - Test UI on 320px minimum width
4. **Demo mode** - Frontend can run with demo data (no backend required) via demoMode in api.ts
5. **Dev auth** - Disabled by default in production (`APP_DEV_AUTH_ENABLED:false`)
