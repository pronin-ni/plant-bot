# AGENT DOCUMENTATION — Plant Bot / Mini App / PWA

Документ для AI-агентов и разработчиков, чтобы быстро понять архитектуру, ограничения и безопасно вносить изменения.

## 1. Что это за проект

Монолит на Spring Boot (`Java 17`) с тремя интерфейсами:
- Telegram Bot (LongPolling)
- Telegram Mini App (`/mini-app/...`)
- PWA (`/pwa/...`)

Все работают с одной БД SQLite и одним backend API (`/api/...`).

## 2. Режимы запуска и feature flags

Runtime-флаги:
- `TELEGRAM_BOT_ENABLED=true|false` — включение Telegram-бота
- `APP_FEATURE_MINI_APP_ENABLED=true|false` — доступность web-роутов mini app
- `APP_FEATURE_PWA_ENABLED=true|false` — доступность web-роутов PWA

Важно:
- Backend API должен оставаться доступным независимо от отключения UI-фич.
- Mini App и PWA можно отключать независимо от бота.

## 3. Структура backend

Корень: `/Users/nikitapronin/projects/study/plant-bot/src/main/java/com/example/plantbot`

Основные пакеты:
- `controller/` — REST-контроллеры
- `service/` — бизнес-логика
- `service/ha/` — интеграция Home Assistant
- `service/auth/` — PWA auth провайдеры
- `security/` — JWT, security filter
- `domain/` — JPA сущности
- `repository/` — JPA репозитории
- `bot/` — Telegram bot logic
- `config/` — security, datasource, web, rate-limit

Критичные контроллеры:
- `MiniAppController` — core API растений/календаря
- `OpenRouterAiController` — identify/diagnose через OpenRouter
- `OpenRouterSettingsController` — настройки моделей/API key
- `HomeAssistantController` — опциональная HA-интеграция
- `PwaAuthController` — JWT login для PWA
- `AdminController` — админ-API (RBAC + rate limit)
- `PwaPushController` — web push subscriptions

## 4. Структура фронтендов

- Mini App: `/Users/nikitapronin/projects/study/plant-bot/plant-care-mini-app`
- PWA: `/Users/nikitapronin/projects/study/plant-bot/plant-care-pwa`

Общее:
- React 19 + Vite + TS
- Zustand + TanStack Query
- Tailwind + shadcn/ui
- Framer Motion

PWA дополнительно:
- Service Worker (vite-plugin-pwa)
- Telegram Login Widget + модульный auth-каркас (OAuth providers)
- Admin UI

## 5. База данных и данные

Хранилище:
- SQLite: `./data/plantbot.db`
- Фотографии: `./data/photos`
- Резервные копии: `./data/backups`

Ключевые таблицы/сущности:
- `User`, `Plant`, `WateringLog`
- `AssistantChatHistory` (история AI-вопросов)
- `OpenRouterCacheEntry`
- `WebPushSubscription`
- HA-блок: `HomeAssistantConnection`, `PlantHomeAssistantBinding`, `PlantConditionSample`, `PlantAdjustmentLog`

## 6. AI/OpenRouter

Поддерживается:
- Chat (вопрос-ответ)
- Identify plant по фото
- Diagnose leaf по фото

Важные правила:
- Запросы к OpenRouter идут только через backend.
- Ключ OpenRouter хранится на сервере (и может быть user-scoped в настройках).
- Для photo-моделей в UI должны показываться только модели с `supportsImageToText=true`.
- По умолчанию в выборе моделей — бесплатные (`:free`), платные скрыты до включения чекбокса.

## 7. Home Assistant (опционально)

- HA не обязателен.
- Пользователь сам задает URL и token в UI.
- Токен хранится шифрованно на backend.
- Если HA не настроен — HA-блоки в карточках/списках должны быть скрыты.

## 8. Админка

Доступ:
- только пользователи с `ROLE_ADMIN`
- backend защита обязательна (`@PreAuthorize` + Security)

Текущие admin-фичи:
- overview/users/plants/stats
- очистка кэшей
- тестовый push определенному пользователю (поиск + suggestions)
- просмотр backup-файлов
- восстановление SQLite из выбранного backup

## 9. Push и PWA

Web Push:
- `WEB_PUSH_ENABLED=true`
- нужны `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`

PWA install UX:
- должен показываться install prompt/instruction в зависимости от платформы (iOS/Android/Desktop)
- если браузер поддерживает `beforeinstallprompt` — показывается кнопка установки

## 10. Безопасность

Обязательно:
- Не отдавать секреты на фронт.
- Не писать токены в логи.
- `APP_SECURITY_JWT_SECRET` — уникальный длинный секрет в production.
- CORS ограничивать реальными доменами.
- Для `/api/admin/**` оставлять rate limit.

## 11. Известные риски и технический долг

1. Нет автотестов backend
- `./gradlew test` проходит с `test NO-SOURCE`.
- Нужны хотя бы smoke/integration тесты на auth + plants + admin.

2. Риск блокировок SQLite при конкурентной нагрузке
- Нужно держать пул соединений минимальным (обычно `1` для SQLite).
- Проверять, что настройки пула реально применяются.

3. Контент-негациация в exception handler
- По логам встречался `HttpMediaTypeNotAcceptableException` внутри `ApiExceptionHandler`.
- Нужен fallback-ответ без тела/с text fallback для нестандартных `Accept`.

4. Крупный JS chunk в PWA
- Vite предупреждает chunk > 500KB.
- Нужен code-splitting для тяжелых экранов (admin/settings/charts).

## 12. Локальная проверка перед релизом

Backend:
```bash
cd /Users/nikitapronin/projects/study/plant-bot
./gradlew clean test
```

Mini App:
```bash
cd /Users/nikitapronin/projects/study/plant-bot/plant-care-mini-app
npm run build
```

PWA:
```bash
cd /Users/nikitapronin/projects/study/plant-bot/plant-care-pwa
npm run build
```

Проверить вручную:
- авторизацию Telegram/PWA
- список растений, карточка, отметка полива
- календарь
- AI chat / identify / diagnose
- настройки OpenRouter (модели + фильтр free/paid)
- админка: clear cache, push test, backups

## 13. Правила для агентов при изменениях

- Не изменять/удалять пользовательские данные в `data/` без явного запроса.
- Не использовать destructive git-команды.
- Перед крупными правками фиксировать текущий статус через сборку backend + оба frontend build.
- Для bugfix сначала локализовать проблему в одном слое (UI/API/service/db), затем править минимально.
- После правок обязательно повторять 3 сборки (backend, mini app, pwa).

## 14. Что уже реализовано (сводно)

- Bot + Mini App + PWA в одном Spring Boot runtime
- PWA auth foundation (Telegram + каркас OAuth providers)
- JWT + RBAC (`ROLE_USER`, `ROLE_ADMIN`)
- Admin API и admin-экран PWA
- OpenRouter chat + vision (identify/diagnose)
- Персональные настройки OpenRouter моделей/ключа
- Home Assistant интеграция (опционально)
- Web Push subscriptions + admin test push
- Ночные backup SQLite + restore из админки
- Platform-adaptive UI (iOS/Android patterns)

