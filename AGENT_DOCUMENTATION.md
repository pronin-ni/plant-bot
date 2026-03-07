# Документация для агентов: Структура проекта Plant Bot

## 1. Обзор проекта
Одноконтейнерное приложение, объединяющее:
- Spring Boot backend (`/api/...`)
- Telegram Mini App (`/mini-app/...`)

### Режимы работы
- **Полный режим**: бот + API + Mini App
- **Miniapp-only**: API + Mini App без Telegram-бота

## 2. Основные директории

### Backend (Java)
```
src/main/java/com/example/plantbot/
├── bot/               # Телеграм-бот
│   ├── ConversationState.java  # Управление состоянием диалога
│   └── PlantTelegramBot.java   # Основной обработчик событий
├── config/            # Конфигурация Spring
│   ├── TelegramConfig.java     # Настройки бота
│   └── WebConfig.java          # CORS, веб-маршруты
├── controller/        # REST API endpoints
│   ├── MiniAppController.java  # Основные эндпоинты Mini App
│   ├── HomeAssistantController.java # Интеграция с HA
│   └── OpenRouterAiController.java # Обработка запросов к OpenRouter
├── service/           # Бизнес-логика
│   ├── PlantService.java       # Управление растениями
│   └── HomeAssistantService.java # Работа с HA
├── repository/        # Доступ к данным
└── util/              # Вспомогательные классы
```

### Frontend (Mini App)
```
plant-care-mini-app/src/
├── app/
│   ├── home-screen.tsx         # Главный экран
│   ├── add-plant-screen.tsx    # Экран добавления растения
│   ├── PlantDetail/
│   │   ├── DiagnosisTool.tsx   # Диагностика по фото
│   │   └── GrowthGallery.tsx   # Галерея роста
│   └── Settings/
│       ├── HomeAssistantSetup.tsx # Настройка HA
│       └── OpenRouterModelSettings.tsx # Настройка моделей OpenRouter
├── components/
│   ├── ConditionsChart.tsx     # График условий
│   └── SmartReminderCard.tsx   # Умное напоминание
├── lib/
│   ├── api.ts                  # API-клиент
│   └── telegram.tsx            # Интеграция с Telegram
└── types/                      # TypeScript типы
```

## 3. Ключевые компоненты

### 3.1. Телеграм-бот (Java)
- **PlantTelegramBot.java**: Основная логика обработки команд
  - Состояния диалога через `ConversationState`
  - Обработка `/start`, `/add`, `/admin`
- **MiniAppController.java**: API для Mini App
  - `POST /api/auth/validate`: Валидация пользователя
  - `GET /api/plants`: Получение списка растений

### 3.2. Интеграции
- **Home Assistant**:
  - Конфигурация: `Settings -> Home Assistant` в Mini App
  - Данные: `GET /api/home-assistant/rooms-and-sensors`
- **OpenRouter**:
  - Модели: `OPENROUTER_MODEL_PHOTO_IDENTIFY` (идентификация), `OPENROUTER_MODEL_PHOTO_DIAGNOSE` (диагностика)

### 3.3. Структура данных
- **Растение** (`Plant`):
  ```java
  class Plant {
    Long id;
    String name;
    String species;
    LocalDateTime lastWatered;
    // ...
  }
  ```
- **Уведомления**:
  - Автоматическое обновление календаря через ICS-фид

## 4. Как добавить новую функциональность

### 4.1. Добавление нового экрана в Mini App
1. Создать компонент в `src/app/`
2. Добавить роут в `App.tsx`
3. Обновить навигацию в `ios-bottom-tab.tsx`

### 4.2. Новый API endpoint
1. Создать контроллер в `controller/`
2. Добавить сервисную логику в `service/`
3. Настроить валидацию в `config/WebConfig.java`

### 4.3. Новая команда бота
1. Добавить обработку в `PlantTelegramBot.java`
2. Обновить `ConversationState.java`
3. Протестировать через локальный режим (см. README)

## 5. Режимы разработки

### 5.1. Локальная разработка без Telegram
```bash
TELEGRAM_BOT_ENABLED=false APP_DEV_AUTH_ENABLED=true ./gradlew bootRun
```
- Используется `APP_DEV_TELEGRAM_ID` и `APP_DEV_USERNAME`

### 5.2. Miniapp-only режим
```bash
docker compose --profile miniapp-only up -d --build
```
- Тестирование API и фронта без бота

## 6. Важные заметки
- **Безопасность HA токена**: Хранится в зашифрованном виде (`./data/ha-master.key`)
- **Фото-обработка**: Всегда через backend, никогда напрямую к OpenRouter
- **Кэширование**: Таймауты для кэша указаны в `.env` (например, `OPENROUTER_CARE_CACHE_TTL_MINUTES`)