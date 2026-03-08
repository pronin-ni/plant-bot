# Plant Bot / «Мои Растения»

Plant Bot is a Java Spring Boot application with two React clients (Telegram Mini App and PWA) for plant care management: watering schedules, AI recommendations, weather-aware tips, Home Assistant integration, push notifications, and admin operations.

## Features

- Plant lifecycle management (create, update, water, delete, photos).
- Calendar and ICS sync for watering reminders.
- Adaptive watering recommendations from history + weather.
- AI features via OpenRouter (chat, care advice, photo identify/diagnose).
- Weather provider selection per user (Open-Meteo/OpenWeather-compatible providers).
- Telegram-based auth and PWA JWT auth.
- Web Push subscriptions and test pushes.
- Home Assistant connection, room/sensor mapping, and condition history.
- Admin dashboard: users, plants, cache control, backups, monitoring, logs.

## Tech Stack

- Frontend (PWA): React 19, Vite 7, TypeScript, Tailwind, shadcn/ui primitives, Framer Motion, TanStack Query/Table, Zustand.
- Frontend (Mini App): React 19, Vite 7, TypeScript, Tailwind, Framer Motion, Zustand.
- Backend: Java 17, Spring Boot 3.2, Spring Web, Spring Data JPA, Spring Security.
- Database: SQLite (Hibernate + community SQLite dialect).
- Integrations: Telegram Bot API, OpenRouter, Home Assistant, Open-Meteo/OpenWeather APIs, Web Push (VAPID).
- Infra: Docker, Docker Compose, GitHub Actions (GHCR publish).

## High-Level Architecture

```text
PWA (React) / Mini App (React)
            |
            | REST API + JWT / Telegram init-data
            v
      Spring Boot Backend
            |
            | JPA/Hibernate
            v
        SQLite database

External services: Telegram, OpenRouter, Weather APIs, Home Assistant, Web Push
```

## Installation

### Prerequisites

- Java 17+
- Node.js 20+
- npm 10+
- (Optional) Docker + Docker Compose

### 1. Clone

```bash
git clone <your-repo-url>
cd plant-bot
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill required secrets at least:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `APP_SECURITY_JWT_SECRET`
- optional: `OPENROUTER_API_KEY`, `OPENWEATHER_API_KEY`, `WEB_PUSH_VAPID_*`

### 3. Run backend

```bash
./gradlew bootRun
```

Backend default URL: `http://localhost:8080`

### 4. Run PWA frontend

```bash
cd plant-care-pwa
cp .env.example .env
npm install
npm run dev
```

### 5. Run Mini App frontend (optional)

```bash
cd ../plant-care-mini-app
cp .env.example .env
npm install
npm run dev
```

## Running with Docker

```bash
docker compose up -d --build
```

Main service URL: `http://localhost:8080`

## Running the Project

### Backend

```bash
./gradlew bootRun
```

### PWA frontend

```bash
cd plant-care-pwa
npm run dev
```

### Mini App frontend

```bash
cd plant-care-mini-app
npm run dev
```

### Docker

```bash
docker compose up -d --build
```

## Project Structure

```text
src/main/java/com/example/plantbot
  controller/      REST controllers
  service/         business logic
  repository/      JPA repositories
  domain/          JPA entities + enums
  security/        JWT filter/service/principal
  config/          Spring and infra config

plant-care-pwa/    PWA frontend
plant-care-mini-app/ Telegram Mini App frontend
```

Detailed docs:

- `DOCUMENTATION.md`
- `ARCHITECTURE.md`
- `DEVELOPMENT_GUIDE.md`
- `AI_CONTEXT.md`

## API Overview

Key groups:

- `/api/plants`, `/api/calendar`, `/api/stats`, `/api/learning`
- `/api/assistant/*`, `/api/plant/*` (OpenRouter vision)
- `/api/openrouter/*` (model/preferences)
- `/api/weather/*`
- `/api/home-assistant/*`
- `/api/pwa/auth/*`, `/api/pwa/push/*`, `/api/pwa/migration/*`
- `/api/admin/*` (ROLE_ADMIN)

Full endpoint documentation is in `DOCUMENTATION.md`.

## Development

- Backend: `./gradlew build` / `./gradlew bootRun`
- Frontend PWA: `npm run dev`, `npm run build` (inside `plant-care-pwa`)
- Frontend Mini App: `npm run dev`, `npm run build` (inside `plant-care-mini-app`)

See `DEVELOPMENT_GUIDE.md` for task-oriented implementation recipes.

## Contributing

1. Create a feature branch.
2. Keep backend/frontend contract in sync.
3. Prefer small, isolated PRs.
4. Add/update docs for each behavioral change.
5. Validate manually because automated tests are currently minimal.
