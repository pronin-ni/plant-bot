# Plant Telegram Bot

Интеллектуальный Telegram-бот для ухода за домашними растениями.

## Запуск

1. Установить Java 17+.
2. Создать бота через BotFather и получить токен.
3. Получить ключ OpenWeather (опционально, для адаптации по погоде).
4. Получить ключ Perenual (для автоподбора базового интервала по названию растения).
5. Запустить:

```bash
export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
export BOT_UPDATE_THREADS=4
export BOT_LIST_CARD_CACHE_MAX_ENTRIES=1000
export OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
export OPENROUTER_MODEL=openai/gpt-4o-mini
export OPENROUTER_MODEL_PLANT=openai/gpt-4o-mini
export OPENROUTER_MODEL_CHAT=openai/gpt-4o-mini
export OPENROUTER_CARE_CACHE_TTL_MINUTES=10080
export OPENROUTER_WATERING_CACHE_TTL_MINUTES=720
export OPENROUTER_CHAT_CACHE_TTL_MINUTES=10080
export OPENROUTER_CACHE_MAX_ENTRIES=5000
export OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY
export OPENWEATHER_CACHE_MAX_ENTRIES=500
export OPENWEATHER_RAIN_MAX_KEYS=500
export PERENUAL_API_KEY=YOUR_PERENUAL_KEY
export HTTP_CLIENT_CONNECT_TIMEOUT_MS=5000
export HTTP_CLIENT_READ_TIMEOUT_MS=15000

./scripts/ensure-gradle-wrapper.sh
./gradlew bootRun
```

База данных SQLite будет создана в `./data/plantbot.db`.

## Переменные окружения

Обязательные:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `BOT_UPDATE_THREADS` (кол-во параллельных обработчиков обновлений, по умолчанию `4`)
- `BOT_LIST_CARD_CACHE_MAX_ENTRIES` (лимит in-memory кэша карточек `/list`, по умолчанию `1000`)

Опциональные (рекомендуются):
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (пример: `openai/gpt-4o-mini`)
- `OPENROUTER_MODEL_PLANT` (модель для автопоиска/советов; если пусто — берется `OPENROUTER_MODEL`)
- `OPENROUTER_MODEL_CHAT` (модель для свободных вопросов в чате; если пусто — берется `OPENROUTER_MODEL_PLANT`/`OPENROUTER_MODEL`)
- `OPENROUTER_CARE_CACHE_TTL_MINUTES` (TTL кэша советов по циклу/добавкам, по умолчанию `10080`)
- `OPENROUTER_WATERING_CACHE_TTL_MINUTES` (TTL кэша профиля полива, по умолчанию `720`)
- `OPENROUTER_CHAT_CACHE_TTL_MINUTES` (TTL кэша AI-ответов на вопросы, по умолчанию `10080`)
- `OPENROUTER_CACHE_MAX_ENTRIES` (глобальный лимит записей OpenRouter-кэша в SQLite, по умолчанию `5000`)
- `OPENWEATHER_API_KEY`
- `OPENWEATHER_CACHE_MAX_ENTRIES` (лимит in-memory кэша погоды, по умолчанию `500`)
- `OPENWEATHER_RAIN_MAX_KEYS` (лимит ключей in-memory истории осадков, по умолчанию `500`)
- `PERENUAL_API_KEY`

Сетевые таймауты HTTP-клиента (мс):
- `HTTP_CLIENT_CONNECT_TIMEOUT_MS` (по умолчанию `5000`)
- `HTTP_CLIENT_READ_TIMEOUT_MS` (по умолчанию `15000`)

## Команды

- `/add` — добавить растение (автопоиск интервала и типа + подтверждение: оставить/изменить, поддерживает ввод названия на русском)
- `/list` — список растений (дата следующего полива, рекомендованный объём воды, цикл и добавки)
- `/delete` — удалить растение
- `/calendar` — календарь поливов на текущий и следующий месяц
- `/stats` — статистика
- `/learning` — как бот корректирует интервал
- `/setcity` — установить город для погоды
- `/recalc` — полностью обновить расписание полива и пересчитать рекомендации по всем растениям
- `/clearcache` — очистить накопленные кэши (поиск растений, OpenRouter, погода)
- `/cancel` — отменить текущий ввод
- `Любой текст без команды` — вопрос по садоводству (ответ через OpenRouter с кэшированием)

## Docker (NAS)

```bash
export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
export BOT_UPDATE_THREADS=4
export BOT_LIST_CARD_CACHE_MAX_ENTRIES=1000
export OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
export OPENROUTER_MODEL=openai/gpt-4o-mini
export OPENROUTER_MODEL_PLANT=openai/gpt-4o-mini
export OPENROUTER_MODEL_CHAT=openai/gpt-4o-mini
export OPENROUTER_CARE_CACHE_TTL_MINUTES=10080
export OPENROUTER_WATERING_CACHE_TTL_MINUTES=720
export OPENROUTER_CHAT_CACHE_TTL_MINUTES=10080
export OPENROUTER_CACHE_MAX_ENTRIES=5000
export OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY
export OPENWEATHER_CACHE_MAX_ENTRIES=500
export OPENWEATHER_RAIN_MAX_KEYS=500
export PERENUAL_API_KEY=YOUR_PERENUAL_KEY
export HTTP_CLIENT_CONNECT_TIMEOUT_MS=5000
export HTTP_CLIENT_READ_TIMEOUT_MS=15000

docker compose up -d
```

База хранится в named volume `plantbot-data`, поэтому данные сохраняются между перезапусками контейнера.

Можно также скопировать `.env.example` в `.env` и заполнить, тогда `docker compose` подхватит переменные автоматически.

Для локальной сборки из исходников использовать `docker-compose.dev.yml`:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## GHCR (образ из GitHub)

После пуша в `main` GitHub Actions опубликует образ в GHCR: `ghcr.io/pronin-ni/plant-bot:latest`

Примечание по автопоиску: сначала запрос в OpenRouter, затем цепочка `словарь -> MyMemory ru->en -> транслитерация -> iNaturalist aliases`.
Если Perenual недоступен или достигнут лимит, бот использует fallback через GBIF и эвристику.
Для экономии лимитов API включен TTL-кэш поиска в SQLite (`perenual.cache-ttl-minutes`, по умолчанию 10080 = 7 дней).

OpenRouter-кэш (подбор интервала, care/watering, чат-ответы) теперь хранится в SQLite (`openrouter_cache`), а не в RAM.

### OpenRouter prompt and response contract

System prompt:

```text
You are a plant-care assistant.
Task: estimate watering interval in days for ONE houseplant name.
Return ONLY valid JSON (no markdown, no prose) with this exact schema:
{
  "normalized_name": "string",
  "interval_days": 1,
  "type_hint": "SUCCULENT|TROPICAL|FERN|DEFAULT",
  "confidence": 0.0
}
Rules:
- interval_days must be integer in [1..30]
- confidence must be number in [0..1]
- if uncertain, choose DEFAULT and a conservative interval_days
```

User prompt example:

```text
Plant name: Гибискус
```

Expected response example:

```json
{
  "normalized_name": "Hibiscus",
  "interval_days": 5,
  "type_hint": "TROPICAL",
  "confidence": 0.78
}
```
