# Plant Telegram Bot

Интеллектуальный Telegram-бот для ухода за домашними растениями.

## Запуск

1. Установи Java 17+.
2. Создай бота через BotFather и получи токен.
3. Получи ключ OpenWeather (опционально, для адаптации по погоде).
4. Запусти:

```bash
export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export TELEGRAM_BOT_USERNAME=YOUR_BOT_USERNAME
export OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY

./scripts/ensure-gradle-wrapper.sh
./gradlew bootRun
```

База данных SQLite будет создана в `./data/plantbot.db`.

## Команды

- `/add` — добавить растение
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

docker compose up -d
```

База хранится в `./data`, поэтому данные сохраняются между перезапусками контейнера.

Можно также скопировать `.env.example` в `.env` и заполнить, тогда `docker compose` подхватит переменные автоматически.

## GHCR (образ из GitHub)

После пуша в `main` GitHub Actions опубликует образ в GHCR:\n`ghcr.io/pronin-ni/plant-bot:latest`\n
