# Plant Telegram Bot

Интеллектуальный Telegram-бот для ухода за домашними растениями.

## Запуск

1. Установи Java 17+.
2. Создай бота через BotFather и получи токен.
3. Получи ключ OpenWeather (опционально, для адаптации по погоде).
4. Получи ключ Perenual (для автоподбора базового интервала по названию растения).
5. Запусти:

```bash
export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
export OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY
export PERENUAL_API_KEY=YOUR_PERENUAL_KEY

./scripts/ensure-gradle-wrapper.sh
./gradlew bootRun
```

База данных SQLite будет создана в `./data/plantbot.db`.

## Команды

- `/add` — добавить растение (с автопоиском базового интервала через Perenual, поддерживает ввод названия на русском)
- `/list` — список растений
- `/calendar` — календарь поливов на месяц
- `/stats` — статистика
- `/learning` — как бот корректирует интервал
- `/setcity` — установить город для погоды
- `/cancel` — отменить текущий ввод

## Docker (NAS)

```bash
export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
export OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY
export PERENUAL_API_KEY=YOUR_PERENUAL_KEY

docker compose up -d
```

База хранится в `./data`, поэтому данные сохраняются между перезапусками контейнера.

Можно также скопировать `.env.example` в `.env` и заполнить, тогда `docker compose` подхватит переменные автоматически.

## GHCR (образ из GitHub)

После пуша в `main` GitHub Actions опубликует образ в GHCR: `ghcr.io/pronin-ni/plant-bot:latest`

Примечание по автопоиску: при русском названии бот пробует перевод `ru->en` через MyMemory и fallback-транслитерацию.
