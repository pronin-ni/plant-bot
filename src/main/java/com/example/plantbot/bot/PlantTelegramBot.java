package com.example.plantbot.bot;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.LearningService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.UserService;
import com.example.plantbot.service.WateringLogService;
import com.example.plantbot.service.WateringRecommendationService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.util.CityOption;
import com.example.plantbot.util.PlantCareAdvice;
import com.example.plantbot.util.PlantLookupResult;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.util.WeatherData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.Location;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardRemove;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardButton;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardRow;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Month;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
public class PlantTelegramBot extends TelegramLongPollingBot {
  private static final Locale RU_LOCALE = Locale.forLanguageTag("ru-RU");
  private static final int TELEGRAM_TEXT_LIMIT = 4000;
  private final UserService userService;
  private final PlantService plantService;
  private final PlantCatalogService plantCatalogService;
  private final WateringRecommendationService recommendationService;
  private final WateringLogService wateringLogService;
  private final WeatherService weatherService;
  private final LearningService learningService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;

  @Value("${bot.token}")
  private String botToken;

  @Value("${bot.username}")
  private String botUsername;

  @Value("${bot.update-threads:4}")
  private int updateThreads;

  @Value("${bot.list-card-cache-ttl-minutes:360}")
  private long listCardCacheTtlMinutes;

  private final Map<Long, ConversationState> states = new ConcurrentHashMap<>();
  private final Map<Long, List<CityOption>> pendingCityOptions = new ConcurrentHashMap<>();
  private final Map<Long, Object> userLocks = new ConcurrentHashMap<>();
  private final Map<Long, PlantCardCacheEntry> plantCardCache = new ConcurrentHashMap<>();
  private ExecutorService updateExecutor;

  @PostConstruct
  void initExecutor() {
    int threads = Math.max(2, updateThreads);
    updateExecutor = Executors.newFixedThreadPool(threads, runnable -> {
      Thread t = new Thread(runnable);
      t.setName("telegram-update-" + t.getId());
      t.setDaemon(true);
      return t;
    });
    log.info("Telegram update executor started with {} threads", threads);
  }

  @PreDestroy
  void shutdownExecutor() {
    if (updateExecutor == null) {
      return;
    }
    updateExecutor.shutdown();
    try {
      if (!updateExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
        updateExecutor.shutdownNow();
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      updateExecutor.shutdownNow();
    }
  }

  @Override
  public void onUpdateReceived(Update update) {
    if (updateExecutor == null) {
      processUpdate(update);
      return;
    }
    updateExecutor.submit(() -> processUpdate(update));
  }

  @Override
  public String getBotUsername() {
    return botUsername;
  }

  @Override
  public String getBotToken() {
    return botToken;
  }

  private void processUpdate(Update update) {
    Long lockId = extractUserId(update);
    if (lockId == null) {
      safeProcessUpdate(update);
      return;
    }
    Object lock = userLocks.computeIfAbsent(lockId, k -> new Object());
    synchronized (lock) {
      safeProcessUpdate(update);
    }
  }

  private void safeProcessUpdate(Update update) {
    try {
      if (update.hasCallbackQuery()) {
        log.info("Callback received: {}", update.getCallbackQuery().getData());
        handleCallback(update.getCallbackQuery());
        return;
      }
      if (!update.hasMessage()) {
        return;
      }
      Message message = update.getMessage();
      User user = userService.getOrCreate(message);
      if (message.hasLocation()) {
        handleLocationMessage(user, message);
        return;
      }
      if (!message.hasText()) {
        return;
      }
      String text = message.getText().trim();
      log.info("Message received from user={} chatId={} text='{}'", user.getTelegramId(), message.getChatId(), text);

      if (text.startsWith("/")) {
        handleCommand(user, message, text);
        return;
      }

      handleConversation(user, message, text);
    } catch (Exception ex) {
      log.error("Failed to process telegram update: {}", ex.getMessage(), ex);
    }
  }

  private Long extractUserId(Update update) {
    try {
      if (update.hasCallbackQuery() && update.getCallbackQuery().getFrom() != null) {
        return update.getCallbackQuery().getFrom().getId();
      }
      if (update.hasMessage() && update.getMessage().getFrom() != null) {
        return update.getMessage().getFrom().getId();
      }
    } catch (Exception ignored) {
      return null;
    }
    return null;
  }

  public boolean sendWateringReminder(Plant plant, WateringRecommendation rec) {
    String text = "\uD83D\uDCA7 Пора поливать \"" + plant.getName() + "\"!\n"
        + "Рекомендуемый интервал: " + formatDays(rec.intervalDays()) + "\n"
        + "Рекомендуемый объём воды: " + formatWaterAmount(plant, rec);
    SendMessage msg = new SendMessage(String.valueOf(plant.getUser().getTelegramId()), text);
    msg.setReplyMarkup(wateredButton(plant.getId()));
    try {
      execute(msg);
      return true;
    } catch (Exception ex) {
      log.error("Failed to send watering reminder to chat {}: {}", msg.getChatId(), ex.getMessage(), ex);
      return false;
    }
  }

  private void handleCommand(User user, Message message, String text) {
    String[] parts = text.split("\\s+", 2);
    String command = parts[0].toLowerCase(Locale.ROOT);

    switch (command) {
      case "/start" -> sendText(message.getChatId(),
          "🌿 Привет! Я бот для ухода за растениями.\n\n"
              + "Доступные команды:\n"
              + "• /add — добавить растение\n"
              + "• /list — список растений\n"
              + "• /delete — удалить растение\n"
              + "• /calendar — календарь поливов\n"
              + "• /stats — статистика\n"
              + "• /learning — адаптация интервала\n"
              + "• /setcity — город для погоды\n"
              + "• /recalc — обновить расписание полива\n"
              + "• /clearcache — очистить накопленные кэши");
      case "/add" -> startAddPlant(user, message.getChatId());
      case "/list" -> sendPlantList(user, message.getChatId());
      case "/delete" -> sendDeleteList(user, message.getChatId());
      case "/calendar" -> sendCalendar(user, message.getChatId());
      case "/stats" -> sendStats(user, message.getChatId());
      case "/learning" -> sendLearning(user, message.getChatId());
      case "/recalc" -> startRecalc(user, message.getChatId());
      case "/clearcache" -> askClearCacheConfirmation(message.getChatId());
      case "/cancel" -> cancelFlow(user, message.getChatId());
      case "/setcity" -> {
        if (parts.length > 1) {
          resolveAndSetCity(user, message.getChatId(), parts[1].trim());
        } else {
          ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
          state.setStep(ConversationState.Step.SET_CITY);
          sendCityInputPrompt(message.getChatId());
        }
      }
      default -> sendText(message.getChatId(), "Не понял команду.\nПопробуй: /add, /list, /calendar");
    }
    log.info("Command handled: user={} command='{}'", user.getTelegramId(), command);
  }

  private void handleConversation(User user, Message message, String text) {
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());

    switch (state.getStep()) {
      case ADD_NAME -> {
        state.setName(text);
        if (applyAutoInterval(state, message.getChatId())) {
          state.setStep(ConversationState.Step.ADD_INTERVAL_DECISION);
        } else {
          askPlacement(state, message.getChatId());
        }
        log.info("Add flow: name accepted user={} name='{}'", user.getTelegramId(), state.getName());
      }
      case ADD_INTERVAL_DECISION -> sendTextWithCancel(message.getChatId(),
          "Выбери интервал кнопками ниже: оставить найденный или изменить вручную.");
      case ADD_PLACEMENT -> sendTextWithCancel(message.getChatId(), "Выбери тип размещения: домашнее или уличное.");
      case ADD_POT -> {
        Double volume = parseDouble(text);
        if (volume == null || volume <= 0) {
          sendTextWithCancel(message.getChatId(), "Не смог распознать объём.\nПример: 2.5");
          return;
        }
        state.setPotVolume(volume);
        if (state.getBaseInterval() == null) {
          state.setStep(ConversationState.Step.ADD_INTERVAL);
          sendTextWithCancel(message.getChatId(), "Введи базовый интервал полива в днях.\nПример: 7");
        } else {
          askForTypeDecisionOrManual(state, message.getChatId());
        }
        log.info("Add flow: pot accepted user={} pot={} interval={}",
            user.getTelegramId(), state.getPotVolume(), state.getBaseInterval());
      }
      case ADD_OUTDOOR_AREA -> {
        Double area = parseDouble(text);
        if (area == null || area <= 0) {
          sendTextWithCancel(message.getChatId(), "Не смог распознать площадь.\nПример: 3.5 (м²)");
          return;
        }
        state.setOutdoorAreaM2(area);
        state.setPotVolume(1.0);
        state.setStep(ConversationState.Step.ADD_OUTDOOR_SOIL);
        SendMessage msg = new SendMessage(String.valueOf(message.getChatId()), "Выбери тип почвы участка:");
        msg.setReplyMarkup(soilButtons());
        safeExecute(msg);
        log.info("Add flow: outdoor area accepted user={} area={} interval={}",
            user.getTelegramId(), state.getOutdoorAreaM2(), state.getBaseInterval());
      }
      case ADD_OUTDOOR_SOIL -> sendTextWithCancel(message.getChatId(), "Выбери тип почвы кнопкой.");
      case ADD_OUTDOOR_SUN -> sendTextWithCancel(message.getChatId(), "Выбери освещенность кнопкой.");
      case ADD_OUTDOOR_MULCH -> sendTextWithCancel(message.getChatId(), "Есть ли мульча? Выбери кнопкой.");
      case ADD_OUTDOOR_PERENNIAL -> sendTextWithCancel(message.getChatId(), "Это многолетнее растение? Выбери кнопкой.");
      case ADD_OUTDOOR_WINTER_PAUSE -> sendTextWithCancel(message.getChatId(), "Включить зимнюю паузу полива? Выбери кнопкой.");
      case ADD_INTERVAL -> {
        Integer interval = parseInt(text);
        if (interval == null || interval <= 0) {
          sendTextWithCancel(message.getChatId(), "Не смог распознать интервал.\nПример: 7");
          return;
        }
        state.setBaseInterval(interval);
        askForTypeDecisionOrManual(state, message.getChatId());
        log.info("Add flow: manual interval set user={} interval={}", user.getTelegramId(), interval);
      }
      case ADD_TYPE_DECISION -> sendTextWithCancel(message.getChatId(),
          "Подтверди тип растения кнопками ниже: оставить найденный или выбрать вручную.");
      case SET_CITY -> {
        resolveAndSetCity(user, message.getChatId(), text);
      }
      case SET_CITY_CHOOSE -> sendTextWithCancel(message.getChatId(), "Выбери город кнопкой ниже или отмени действие.");
      case RECALC_WAIT_CITY, RECALC_WAIT_CITY_CHOOSE, RECALC_OUTDOOR_SOIL, RECALC_OUTDOOR_SUN, RECALC_OUTDOOR_MULCH ->
          sendText(message.getChatId(), "Сценарий уточняющих шагов отключен. Используй /recalc для полного обновления расписания.");
      default -> sendText(message.getChatId(), "Чтобы начать, используй /add");
    }
  }

  private void handleCallback(CallbackQuery callbackQuery) {
    String data = callbackQuery.getData();
    Long chatId = callbackQuery.getMessage().getChatId();
    User user = userService.getOrCreate(callbackQuery.getFrom());

    if (data.startsWith("watered:")) {
      Long plantId = Long.parseLong(data.substring("watered:".length()));
      Plant plant = plantService.getById(plantId);
      if (plant == null) {
        sendText(chatId, "Растение не найдено");
        return;
      }
      if (!plant.getUser().getTelegramId().equals(user.getTelegramId())) {
        sendText(chatId, "Это растение принадлежит другому пользователю.");
        return;
      }
      WateringRecommendation rec = recommendationService.recommendQuick(plant);
      plant.setLastWateredDate(LocalDate.now());
      plant.setLastReminderDate(null);
      plantService.save(plant);
      invalidatePlantCardCache(plant.getId());
      wateringLogService.addLog(plant, LocalDate.now(), rec.intervalDays(), rec.waterLiters(),
          null,
          null);
      LocalDate nextWateringDate = LocalDate.now().plusDays((long) Math.floor(rec.intervalDays()));
      sendText(chatId, "✅ Полив отмечен: \"" + plant.getName() + "\"\n"
          + "Следующий полив: " + nextWateringDate);
      return;
    }

    if (data.startsWith("delete:")) {
      Long plantId = Long.parseLong(data.substring("delete:".length()));
      Plant plant = plantService.getById(plantId);
      if (plant == null) {
        sendText(chatId, "Растение не найдено");
        return;
      }
      if (!plant.getUser().getTelegramId().equals(user.getTelegramId())) {
        sendText(chatId, "Это растение принадлежит другому пользователю.");
        return;
      }
      String name = plant.getName();
      plantService.delete(plant);
      invalidatePlantCardCache(plantId);
      sendText(chatId, "🗑 Удалено: \"" + name + "\"");
      log.info("Plant deleted: user={} plantId={} name='{}'", user.getTelegramId(), plantId, name);
      return;
    }

    if ("cancel".equals(data)) {
      cancelFlow(user, chatId);
      return;
    }

    if ("clearcache:confirm".equals(data)) {
      clearAllCaches(chatId);
      return;
    }

    if ("clearcache:cancel".equals(data)) {
      sendText(chatId, "Ок, очистку кэша отменил.");
      return;
    }

    if (data.startsWith("recalc:") || data.startsWith("recalcsoil:")
        || data.startsWith("recalcsun:") || data.startsWith("recalcmulch:")) {
      sendText(chatId, "Этот сценарий больше не используется. Запусти /recalc для обновления расписания.");
      return;
    }

    if (data.startsWith("citypick:")) {
      List<CityOption> options = pendingCityOptions.get(user.getTelegramId());
      if (options == null || options.isEmpty()) {
        sendText(chatId, "Список вариантов устарел.\nВведи /setcity снова.");
        return;
      }
      Integer idx = parseInt(data.substring("citypick:".length()));
      if (idx == null || idx < 0 || idx >= options.size()) {
        sendText(chatId, "Не удалось выбрать город.\nВведи /setcity снова.");
        return;
      }
      CityOption selected = options.get(idx);
      applySelectedCity(user, selected);
      pendingCityOptions.remove(user.getTelegramId());
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      state.reset();
      sendText(chatId, "🌆 Город сохранен: " + selected.displayName());
      return;
    }

    if ("interval:accept".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_INTERVAL_DECISION && state.getBaseInterval() != null) {
        askPlacement(state, chatId);
        log.info("Add flow: interval accepted user={} interval={}", user.getTelegramId(), state.getBaseInterval());
      }
      return;
    }

    if ("interval:edit".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_INTERVAL_DECISION) {
        state.setBaseInterval(null);
        askPlacement(state, chatId);
        log.info("Add flow: interval switched to manual user={}", user.getTelegramId());
      }
      return;
    }

    if (data.startsWith("placement:")) {
      String placementName = data.substring("placement:".length());
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_PLACEMENT) {
        return;
      }
      try {
        PlantPlacement placement = PlantPlacement.valueOf(placementName);
        state.setPlacement(placement);
        if (placement == PlantPlacement.OUTDOOR) {
          state.setStep(ConversationState.Step.ADD_OUTDOOR_AREA);
          sendTextWithCancel(chatId, "Укажи площадь посадки в м² (например: 3.5)");
        } else {
          state.setOutdoorAreaM2(null);
          state.setStep(ConversationState.Step.ADD_POT);
          sendTextWithCancel(chatId, "Введи объём горшка в литрах (например: 2.5)");
        }
        log.info("Add flow: placement accepted user={} placement={}", user.getTelegramId(), placement);
      } catch (IllegalArgumentException ex) {
        sendText(chatId, "Не распознал тип размещения.\nНажми одну из кнопок.");
      }
      return;
    }

    if (data.startsWith("soil:")) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_OUTDOOR_SOIL) {
        return;
      }
      try {
        state.setOutdoorSoilType(com.example.plantbot.domain.OutdoorSoilType.valueOf(data.substring("soil:".length())));
        state.setStep(ConversationState.Step.ADD_OUTDOOR_SUN);
        SendMessage msg = new SendMessage(String.valueOf(chatId), "Освещенность участка:");
        msg.setReplyMarkup(sunButtons());
        safeExecute(msg);
      } catch (IllegalArgumentException ignored) {
        sendText(chatId, "Не распознал тип почвы.\nНажми кнопку из списка.");
      }
      return;
    }

    if (data.startsWith("sun:")) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_OUTDOOR_SUN) {
        return;
      }
      try {
        state.setSunExposure(com.example.plantbot.domain.SunExposure.valueOf(data.substring("sun:".length())));
        state.setStep(ConversationState.Step.ADD_OUTDOOR_MULCH);
        SendMessage msg = new SendMessage(String.valueOf(chatId), "Есть мульча?");
        msg.setReplyMarkup(yesNoButtons("mulch"));
        safeExecute(msg);
      } catch (IllegalArgumentException ignored) {
        sendText(chatId, "Не распознал освещенность.\nНажми кнопку из списка.");
      }
      return;
    }

    if (data.startsWith("mulch:")) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_OUTDOOR_MULCH) {
        return;
      }
      state.setMulched("yes".equals(data.substring("mulch:".length())));
      state.setStep(ConversationState.Step.ADD_OUTDOOR_PERENNIAL);
      SendMessage msg = new SendMessage(String.valueOf(chatId), "Это многолетнее растение?");
      msg.setReplyMarkup(yesNoButtons("perennial"));
      safeExecute(msg);
      return;
    }

    if (data.startsWith("perennial:")) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_OUTDOOR_PERENNIAL) {
        return;
      }
      boolean perennial = "yes".equals(data.substring("perennial:".length()));
      state.setPerennial(perennial);
      if (perennial) {
        state.setStep(ConversationState.Step.ADD_OUTDOOR_WINTER_PAUSE);
        SendMessage msg = new SendMessage(String.valueOf(chatId), "Включить зимнюю паузу полива?");
        msg.setReplyMarkup(yesNoButtons("winterpause"));
        safeExecute(msg);
      } else {
        state.setWinterDormancyEnabled(false);
        continueAfterOutdoorMeta(state, chatId);
      }
      return;
    }

    if (data.startsWith("winterpause:")) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() != ConversationState.Step.ADD_OUTDOOR_WINTER_PAUSE) {
        return;
      }
      state.setWinterDormancyEnabled("yes".equals(data.substring("winterpause:".length())));
      continueAfterOutdoorMeta(state, chatId);
      return;
    }

    if ("type:accept".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_TYPE_DECISION && state.getSuggestedType() != null) {
        state.setType(state.getSuggestedType());
        log.info("Add flow: type accepted user={} type={}", user.getTelegramId(), state.getType());
        finishAddPlant(user, chatId, state);
      }
      return;
    }

    if ("type:edit".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_TYPE_DECISION) {
        state.setStep(ConversationState.Step.ADD_TYPE);
        SendMessage msg = new SendMessage(String.valueOf(chatId), "Выбери тип растения вручную:");
        msg.setReplyMarkup(typeButtons());
        safeExecute(msg);
        log.info("Add flow: type switched to manual user={}", user.getTelegramId());
      }
    }

    if (data.startsWith("type:")) {
      String typeName = data.substring("type:".length());
      if ("accept".equals(typeName) || "edit".equals(typeName)) {
        // handled by explicit branches above
        return;
      }
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_TYPE) {
        try {
          PlantType type = PlantType.valueOf(typeName);
          state.setType(type);
          finishAddPlant(user, chatId, state);
        } catch (IllegalArgumentException ex) {
          log.warn("Unknown plant type callback: '{}'", data);
          sendText(chatId, "Не распознал тип растения.\nВыбери вариант кнопкой.");
        }
      }
      return;
    }
  }

  private void startRecalc(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "🌱 Сначала добавь растение через /add");
      return;
    }

    invalidateUserPlantCardCache(plants);

    Integer loadingMessageId = sendLoadingMessage(chatId, "⏳ Пересчитываю график полива по всем растениям...");
    StringBuilder result = new StringBuilder("🔄 Пересчет завершен\n");

    for (Plant plant : plants) {
      WateringRecommendation rec = recommendationService.recommend(plant, user);
      LocalDate due = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      putPlantCardCache(plant.getId(), buildPlantCard(user, plant, rec));
      result.append("\n• ").append(plant.getName())
          .append(": ").append(formatDays(rec.intervalDays()))
          .append(", ").append(formatWaterAmount(plant, rec))
          .append(", следующий полив ").append(due);
    }

    if (!tryEditMessage(chatId, loadingMessageId, result.toString(), null)) {
      sendText(chatId, result.toString());
    }
  }

  private void startAddPlant(User user, Long chatId) {
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.reset();
    state.setStep(ConversationState.Step.ADD_NAME);
    sendTextWithCancel(chatId, "🪴 Введи название растения.\nЯ попробую автоматически подобрать интервал полива.");
  }

  private boolean applyAutoInterval(ConversationState state, Long chatId) {
    Optional<PlantLookupResult> suggestion = plantCatalogService.suggestIntervalDays(state.getName());
    if (suggestion.isEmpty()) {
      sendText(chatId, "Автопоиск интервала не сработал. Попрошу ввести интервал вручную на следующем шаге.");
      log.info("Auto interval not found for '{}'", state.getName());
      return false;
    }
    PlantLookupResult result = suggestion.get();
    state.setBaseInterval(result.baseIntervalDays());
    state.setSuggestedType(result.suggestedType());
    state.setLookupSource(result.source());
    SendMessage msg = new SendMessage(String.valueOf(chatId), String.format(Locale.ROOT,
        "Нашел \"%s\" (%s). Базовый интервал: %d дн. Оставить или изменить?",
        result.displayName(), result.source(), result.baseIntervalDays()));
    msg.setReplyMarkup(intervalDecisionButtons());
    safeExecute(msg);
    log.info("Auto interval applied for '{}' -> {} days, suggestedType={}",
        state.getName(), result.baseIntervalDays(), result.suggestedType());
    return true;
  }

  private InlineKeyboardMarkup intervalDecisionButtons() {
    InlineKeyboardButton keep = new InlineKeyboardButton("Оставить");
    keep.setCallbackData("interval:accept");
    InlineKeyboardButton edit = new InlineKeyboardButton("Изменить");
    edit.setCallbackData("interval:edit");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(keep, edit), List.of(cancel)));
    return markup;
  }

  private void askPlacement(ConversationState state, Long chatId) {
    state.setStep(ConversationState.Step.ADD_PLACEMENT);
    SendMessage msg = new SendMessage(String.valueOf(chatId), "📍 Где растет растение?");
    msg.setReplyMarkup(placementButtons());
    safeExecute(msg);
  }

  private InlineKeyboardMarkup placementButtons() {
    InlineKeyboardButton indoor = new InlineKeyboardButton("Домашнее");
    indoor.setCallbackData("placement:INDOOR");
    InlineKeyboardButton outdoor = new InlineKeyboardButton("Уличное");
    outdoor.setCallbackData("placement:OUTDOOR");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(indoor, outdoor), List.of(cancel)));
    return markup;
  }

  private InlineKeyboardMarkup soilButtons() {
    InlineKeyboardButton sandy = new InlineKeyboardButton("Песчаный");
    sandy.setCallbackData("soil:SANDY");
    InlineKeyboardButton loamy = new InlineKeyboardButton("Суглинистый");
    loamy.setCallbackData("soil:LOAMY");
    InlineKeyboardButton clay = new InlineKeyboardButton("Глинистый");
    clay.setCallbackData("soil:CLAY");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(sandy, loamy, clay), List.of(cancel)));
    return markup;
  }

  private InlineKeyboardMarkup sunButtons() {
    InlineKeyboardButton full = new InlineKeyboardButton("Полное солнце");
    full.setCallbackData("sun:FULL_SUN");
    InlineKeyboardButton partial = new InlineKeyboardButton("Полутень");
    partial.setCallbackData("sun:PARTIAL_SHADE");
    InlineKeyboardButton shade = new InlineKeyboardButton("Тень");
    shade.setCallbackData("sun:SHADE");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(full, partial, shade), List.of(cancel)));
    return markup;
  }

  private InlineKeyboardMarkup yesNoButtons(String prefix) {
    InlineKeyboardButton yes = new InlineKeyboardButton("Да");
    yes.setCallbackData(prefix + ":yes");
    InlineKeyboardButton no = new InlineKeyboardButton("Нет");
    no.setCallbackData(prefix + ":no");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(yes, no), List.of(cancel)));
    return markup;
  }

  private void continueAfterOutdoorMeta(ConversationState state, Long chatId) {
    if (state.getBaseInterval() == null) {
      state.setStep(ConversationState.Step.ADD_INTERVAL);
      sendTextWithCancel(chatId, "Введи базовый интервал полива в днях.\nПример: 7");
    } else {
      askForTypeDecisionOrManual(state, chatId);
    }
  }

  private void askForTypeDecisionOrManual(ConversationState state, Long chatId) {
    if (state.getSuggestedType() != null && state.getSuggestedType() != PlantType.DEFAULT) {
      state.setStep(ConversationState.Step.ADD_TYPE_DECISION);
      SendMessage msg = new SendMessage(String.valueOf(chatId),
          "Нашел тип растения: " + state.getSuggestedType().getTitle() + ". Оставить или изменить?");
      msg.setReplyMarkup(typeDecisionButtons());
      safeExecute(msg);
      return;
    }
    state.setStep(ConversationState.Step.ADD_TYPE);
    SendMessage msg = new SendMessage(String.valueOf(chatId), "Тип растения:");
    msg.setReplyMarkup(typeButtons());
    safeExecute(msg);
  }

  private InlineKeyboardMarkup typeDecisionButtons() {
    InlineKeyboardButton keep = new InlineKeyboardButton("Оставить");
    keep.setCallbackData("type:accept");
    InlineKeyboardButton edit = new InlineKeyboardButton("Изменить");
    edit.setCallbackData("type:edit");
    InlineKeyboardButton cancel = cancelButton().getKeyboard().get(0).get(0);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(keep, edit), List.of(cancel)));
    return markup;
  }

  private void finishAddPlant(User user, Long chatId, ConversationState state) {
    PlantType type = state.getType() == null ? PlantType.DEFAULT : state.getType();
    PlantPlacement placement = state.getPlacement() == null ? PlantPlacement.INDOOR : state.getPlacement();
    double potVolume = state.getPotVolume() == null ? 1.0 : state.getPotVolume();
    Plant plant = plantService.addPlant(
        user,
        state.getName(),
        potVolume,
        state.getBaseInterval(),
        type,
        placement,
        state.getOutdoorAreaM2(),
        state.getOutdoorSoilType(),
        state.getSunExposure(),
        state.getMulched(),
        state.getPerennial(),
        state.getWinterDormancyEnabled()
    );
    plant.setLookupSource(state.getLookupSource());
    plant.setLookupAt(Instant.now());
    plant = plantService.save(plant);
    state.reset();
    sendText(chatId, "✅ Растение \"" + plant.getName() + "\" добавлено.");
    log.info("Plant created: user={} plantId={} name='{}' interval={} placement={} pot={} area={} type={}",
        user.getTelegramId(), plant.getId(), plant.getName(), plant.getBaseIntervalDays(),
        plant.getPlacement(), plant.getPotVolumeLiters(), plant.getOutdoorAreaM2(), plant.getType());
  }

  private void sendPlantList(User user, Long chatId) {
    Integer loadingMessageId = sendLoadingMessage(chatId, "⏳ Собираю список растений и считаю рекомендации...");

    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      String text = "🌱 Список пока пуст.\nДобавь первое растение командой /add";
      if (!tryEditMessage(chatId, loadingMessageId, text, null)) {
        sendText(chatId, text);
      }
      return;
    }

    List<Plant> indoor = new ArrayList<>();
    List<Plant> outdoor = new ArrayList<>();
    for (Plant plant : plants) {
      if (plant.getPlacement() == PlantPlacement.OUTDOOR) {
        outdoor.add(plant);
      } else {
        indoor.add(plant);
      }
    }

    Map<Long, String> plantCards = new LinkedHashMap<>();
    List<Plant> pending = new ArrayList<>();
    for (Plant plant : indoor) {
      PlantCardCacheEntry cached = plantCardCache.get(plant.getId());
      if (isPlantCardCacheFresh(cached)) {
        plantCards.put(plant.getId(), cached.cardText());
      } else {
        plantCards.put(plant.getId(), buildLoadingPlantCard(plant));
        pending.add(plant);
      }
    }
    for (Plant plant : outdoor) {
      PlantCardCacheEntry cached = plantCardCache.get(plant.getId());
      if (isPlantCardCacheFresh(cached)) {
        plantCards.put(plant.getId(), cached.cardText());
      } else {
        plantCards.put(plant.getId(), buildLoadingPlantCard(plant));
        pending.add(plant);
      }
    }

    InlineKeyboardMarkup markup = listWaterButtons(plants);
    String initial = buildPlantListText(indoor, outdoor, plantCards);
    Integer targetMessageId = loadingMessageId;
    if (!tryEditMessage(chatId, loadingMessageId, initial, markup)) {
      targetMessageId = sendMessageWithMarkup(chatId, initial, markup);
    }

    for (Plant plant : pending) {
      WateringRecommendation rec = recommendationService.recommend(plant, user);
      String card = buildPlantCard(user, plant, rec);
      putPlantCardCache(plant.getId(), card);
      plantCards.put(plant.getId(), card);
      String updated = buildPlantListText(indoor, outdoor, plantCards);
      tryEditMessage(chatId, targetMessageId, updated, markup);
    }
  }

  private String buildPlantCard(User user, Plant plant, WateringRecommendation rec) {
    LocalDate due = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
    Optional<PlantCareAdvice> careAdvice = openRouterPlantAdvisorService.suggestCareAdvice(plant, rec.intervalDays());
    StringBuilder sb = new StringBuilder("\n🪴 ").append(plant.getName()).append("\n")
        .append("• Последний полив: ").append(plant.getLastWateredDate()).append("\n")
        .append("• Следующий полив: ").append(due).append("\n")
        .append("• Рекомендуемый объём: ").append(formatWaterAmount(plant, rec)).append("\n")
        .append("• Цикл полива: ").append(formatCycle(careAdvice, rec.intervalDays())).append("\n")
        .append("• Грунт: ").append(formatSoilType(plant, careAdvice)).append("\n")
        .append("• Состав грунта: ").append(formatSoilComposition(plant, careAdvice)).append("\n")
        .append("• Добавки: ").append(formatAdditives(plant, careAdvice)).append("\n");
    if (plant.getPlacement() == PlantPlacement.OUTDOOR) {
      sb.append("• Уличные условия: ").append(formatOutdoorMeta(plant)).append("\n");
    }
    sb.append("────────\n");
    return sb.toString();
  }

  private String buildLoadingPlantCard(Plant plant) {
    return "\n🪴 " + plant.getName() + "\n"
        + "• Обновляю рекомендации...\n"
        + "────────\n";
  }

  private String buildPlantListText(List<Plant> indoor, List<Plant> outdoor, Map<Long, String> cards) {
    StringBuilder sb = new StringBuilder("🌿 Твои растения\n");
    if (!indoor.isEmpty()) {
      sb.append("\n🏠 Домашние\n");
      for (Plant plant : indoor) {
        sb.append(cards.getOrDefault(plant.getId(), buildLoadingPlantCard(plant)));
      }
    }
    if (!outdoor.isEmpty()) {
      sb.append("\n🌤 Уличные\n");
      for (Plant plant : outdoor) {
        sb.append(cards.getOrDefault(plant.getId(), buildLoadingPlantCard(plant)));
      }
    }
    return sb.toString();
  }

  private void putPlantCardCache(Long plantId, String cardText) {
    long ttlSeconds = Math.max(1, listCardCacheTtlMinutes) * 60L;
    plantCardCache.put(plantId, new PlantCardCacheEntry(cardText, Instant.now().plusSeconds(ttlSeconds)));
  }

  private boolean isPlantCardCacheFresh(PlantCardCacheEntry entry) {
    return entry != null && entry.expiresAt().isAfter(Instant.now());
  }

  private void invalidatePlantCardCache(Long plantId) {
    if (plantId != null) {
      plantCardCache.remove(plantId);
    }
  }

  private void invalidateUserPlantCardCache(List<Plant> plants) {
    for (Plant plant : plants) {
      plantCardCache.remove(plant.getId());
    }
  }

  private void sendCalendar(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "🌱 Сначала добавь хотя бы одно растение через /add");
      return;
    }
    YearMonth current = YearMonth.now();
    YearMonth nextMonth = current.plusMonths(1);
    StringBuilder sb = new StringBuilder("\uD83D\uDCC5 Календарь поливов на ")
        .append(monthTitle(current)).append(" и ").append(monthTitle(nextMonth)).append("\n");

    appendMonthCalendar(sb, plants, user, current);
    appendMonthCalendar(sb, plants, user, nextMonth);
    sendText(chatId, sb.toString());
  }

  private void appendMonthCalendar(StringBuilder sb, List<Plant> plants, User user, YearMonth month) {
    LocalDate start = month.atDay(1);
    LocalDate end = month.atEndOfMonth();
    sb.append("\n\n").append(monthTitle(month)).append(":\n");
    for (Plant plant : plants) {
      WateringRecommendation rec = recommendationService.recommend(plant, user);
      List<LocalDate> dates = new ArrayList<>();
      LocalDate next = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      while (!next.isAfter(end)) {
        if (!next.isBefore(start)) {
          dates.add(next);
        }
        next = next.plusDays((long) Math.floor(rec.intervalDays()));
      }
      sb.append("\n").append(plant.getName()).append(": ");
      if (dates.isEmpty()) {
        sb.append("нет поливов");
      } else {
        for (int i = 0; i < dates.size(); i++) {
          sb.append(dates.get(i).getDayOfMonth());
          if (i < dates.size() - 1) {
            sb.append(", ");
          }
        }
      }
    }
  }

  private void sendStats(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "📊 Пока нет данных для статистики.");
      return;
    }
    StringBuilder sb = new StringBuilder("\uD83D\uDCCA Статистика:\n");
    for (Plant plant : plants) {
      OptionalDouble avg = learningService.getAverageInterval(plant);
      long totalWaterings = wateringLogService.countAll(plant);
      sb.append("\n").append(plant.getName()).append("\n")
          .append("• средний интервал: ")
          .append(avg.isPresent() ? formatDays(avg.getAsDouble()) : "недостаточно данных").append("\n")
          .append("• поливов: ").append(totalWaterings).append("\n");
    }
    sendText(chatId, sb.toString());
  }

  private void sendDeleteList(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "🗑 Пока нечего удалять.\nСначала добавь растение через /add");
      return;
    }
    SendMessage msg = new SendMessage(String.valueOf(chatId), "Выбери растение для удаления:");
    msg.setReplyMarkup(deleteButtons(plants));
    safeExecute(msg);
  }

  private void clearAllCaches(Long chatId) {
    int lookupRows = plantCatalogService.clearLookupCache();
    OpenRouterPlantAdvisorService.CacheClearStats openRouterStats = openRouterPlantAdvisorService.clearCaches();
    WeatherService.CacheClearStats weatherStats = weatherService.clearCaches();
    int listCardEntries = plantCardCache.size();
    plantCardCache.clear();

    String text = "🧹 Кэши очищены:\n"
        + "• Поиск растений (SQLite): " + lookupRows + "\n"
        + "• OpenRouter (care/watering): " + openRouterStats.careAdviceEntries() + "/" + openRouterStats.wateringProfileEntries() + "\n"
        + "• Погода (cache/rainKeys/samples): " + weatherStats.weatherEntries() + "/"
        + weatherStats.rainKeys() + "/" + weatherStats.rainSamples() + "\n"
        + "• Карточки /list (in-memory): " + listCardEntries;
    sendText(chatId, text);
    log.info("Caches cleared via command: lookupRows={}, openRouterCare={}, openRouterWater={}, weatherEntries={}, rainKeys={}, rainSamples={}, listCardEntries={}",
        lookupRows, openRouterStats.careAdviceEntries(), openRouterStats.wateringProfileEntries(),
        weatherStats.weatherEntries(), weatherStats.rainKeys(), weatherStats.rainSamples(), listCardEntries);
  }

  private void askClearCacheConfirmation(Long chatId) {
    SendMessage msg = new SendMessage(String.valueOf(chatId),
        "Очистить все накопленные кэши?\n"
            + "Будут очищены: поиск растений, OpenRouter-кэши и кэш погоды.");
    msg.setReplyMarkup(clearCacheConfirmButtons());
    safeExecute(msg);
  }

  private void sendLearning(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "🧠 Пока нечего анализировать.");
      return;
    }
    StringBuilder sb = new StringBuilder("\uD83E\uDDE0 Адаптивный интервал:\n");
    for (Plant plant : plants) {
      LearningInfo info = recommendationService.learningInfo(plant, user);
      sb.append("\n").append(plant.getName()).append("\n")
          .append("• базовый интервал: ").append(formatDays(info.baseIntervalDays())).append("\n")
          .append("• средний факт.: ").append(info.avgActualIntervalDays() == null ? "нет данных" : formatDays(info.avgActualIntervalDays())).append("\n")
          .append("• сглаженный: ").append(info.smoothedIntervalDays() == null ? "нет данных" : formatDays(info.smoothedIntervalDays())).append("\n")
          .append("• источник автоподбора: ").append(plant.getLookupSource() == null ? "нет данных" : plant.getLookupSource()).append("\n")
          .append("• коэффициенты (сезон/погода/горшок): ")
          .append(String.format(Locale.ROOT, "%.2f/%.2f/%.2f", info.seasonFactor(), info.weatherFactor(), info.potFactor())).append("\n")
          .append("• итоговый интервал: ").append(formatDays(info.finalIntervalDays())).append("\n");
    }
    sendText(chatId, sb.toString());
  }

  private InlineKeyboardMarkup wateredButton(Long plantId) {
    InlineKeyboardButton button = new InlineKeyboardButton("Полито");
    button.setCallbackData("watered:" + plantId);
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(button)));
    return markup;
  }

  private InlineKeyboardMarkup listWaterButtons(List<Plant> plants) {
    List<List<InlineKeyboardButton>> rows = new ArrayList<>();
    for (Plant plant : plants) {
      InlineKeyboardButton button = new InlineKeyboardButton("Полито: " + plant.getName());
      button.setCallbackData("watered:" + plant.getId());
      rows.add(List.of(button));
    }
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(rows);
    return markup;
  }

  private InlineKeyboardMarkup deleteButtons(List<Plant> plants) {
    List<List<InlineKeyboardButton>> rows = new ArrayList<>();
    for (Plant plant : plants) {
      InlineKeyboardButton button = new InlineKeyboardButton("Удалить: " + plant.getName());
      button.setCallbackData("delete:" + plant.getId());
      rows.add(List.of(button));
    }
    rows.add(List.of(cancelButton().getKeyboard().get(0).get(0)));
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(rows);
    return markup;
  }

  private InlineKeyboardMarkup clearCacheConfirmButtons() {
    InlineKeyboardButton confirm = new InlineKeyboardButton("Да, очистить");
    confirm.setCallbackData("clearcache:confirm");
    InlineKeyboardButton cancel = new InlineKeyboardButton("Отмена");
    cancel.setCallbackData("clearcache:cancel");
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(confirm, cancel)));
    return markup;
  }

  private InlineKeyboardMarkup typeButtons() {
    List<List<InlineKeyboardButton>> rows = new ArrayList<>();
    for (PlantType type : PlantType.values()) {
      InlineKeyboardButton button = new InlineKeyboardButton(type.getTitle());
      button.setCallbackData("type:" + type.name());
      rows.add(List.of(button));
    }
    rows.add(List.of(cancelButton().getKeyboard().get(0).get(0)));
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(rows);
    return markup;
  }

  private void sendText(Long chatId, String text) {
    SendMessage msg = new SendMessage(String.valueOf(chatId), truncateTelegramText(text));
    safeExecute(msg);
  }

  private void sendTextWithCancel(Long chatId, String text) {
    SendMessage msg = new SendMessage(String.valueOf(chatId), text);
    msg.setReplyMarkup(cancelButton());
    safeExecute(msg);
  }

  private void resolveAndSetCity(User user, Long chatId, String query) {
    if (query == null || query.isBlank()) {
      sendTextWithCancel(chatId, "Введи название города или населенного пункта.");
      return;
    }

    List<CityOption> options = weatherService.resolveCityOptions(query, 5);
    if (options.isEmpty()) {
      sendTextWithCancel(chatId, "Не нашел город по этому запросу.\nПопробуй формат: \"Вартемяги\" или \"Вартемяги, RU\".");
      return;
    }

    if (options.size() == 1) {
      applySelectedCity(user, options.get(0));
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      state.reset();
      sendText(chatId, "🌆 Город сохранен: " + options.get(0).displayName());
      return;
    }

    pendingCityOptions.put(user.getTelegramId(), options);
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.setStep(ConversationState.Step.SET_CITY_CHOOSE);

    StringBuilder sb = new StringBuilder("Нашел несколько вариантов. Выбери нужный:\n");
    for (int i = 0; i < options.size(); i++) {
      sb.append(i + 1).append(". ").append(options.get(i).displayName()).append("\n");
    }
    SendMessage msg = new SendMessage(String.valueOf(chatId), sb.toString());
    msg.setReplyMarkup(cityPickButtons(options.size()));
    safeExecute(msg);
  }

  private void handleLocationMessage(User user, Message message) {
    Location location = message.getLocation();
    if (location == null) {
      return;
    }
    Optional<CityOption> resolved = weatherService.resolveCityByCoordinates(location.getLatitude(), location.getLongitude());
    CityOption city = resolved.orElse(new CityOption(
        String.format(Locale.ROOT, "%.5f, %.5f", location.getLatitude(), location.getLongitude()),
        location.getLatitude(),
        location.getLongitude(),
        ""
    ));
    applySelectedCity(user, city);
    pendingCityOptions.remove(user.getTelegramId());
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.reset();
    SendMessage msg = new SendMessage(String.valueOf(message.getChatId()),
        "📍 Геопозиция получена.\n🌆 Город сохранен: " + city.displayName());
    msg.setReplyMarkup(new ReplyKeyboardRemove(true));
    safeExecute(msg);
  }

  private void sendCityInputPrompt(Long chatId) {
    SendMessage msg = new SendMessage(String.valueOf(chatId),
        "Введи город или отправь геопозицию.\n"
            + "Я подберу точный населенный пункт даже при нескольких совпадениях.");
    ReplyKeyboardMarkup kb = new ReplyKeyboardMarkup();
    kb.setResizeKeyboard(true);
    kb.setOneTimeKeyboard(true);
    KeyboardRow row1 = new KeyboardRow();
    KeyboardButton locationBtn = new KeyboardButton("📍 Отправить геопозицию");
    locationBtn.setRequestLocation(true);
    row1.add(locationBtn);
    KeyboardRow row2 = new KeyboardRow();
    row2.add("/cancel");
    kb.setKeyboard(List.of(row1, row2));
    msg.setReplyMarkup(kb);
    safeExecute(msg);
  }

  private void applySelectedCity(User user, CityOption city) {
    user.setCity(city.displayName());
    user.setCityDisplayName(city.displayName());
    user.setCityLat(city.lat());
    user.setCityLon(city.lon());
    userService.save(user);
  }

  private InlineKeyboardMarkup cityPickButtons(int count) {
    List<List<InlineKeyboardButton>> rows = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      InlineKeyboardButton button = new InlineKeyboardButton((i + 1) + ". Выбрать");
      button.setCallbackData("citypick:" + i);
      rows.add(List.of(button));
    }
    rows.add(List.of(cancelButton().getKeyboard().get(0).get(0)));
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(rows);
    return markup;
  }

  private void cancelFlow(User user, Long chatId) {
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.reset();
    pendingCityOptions.remove(user.getTelegramId());
    SendMessage msg = new SendMessage(String.valueOf(chatId), "Ок, действие отменено.\nЕсли нужно, начни заново через /add.");
    msg.setReplyMarkup(new ReplyKeyboardRemove(true));
    safeExecute(msg);
  }

  private InlineKeyboardMarkup cancelButton() {
    InlineKeyboardButton button = new InlineKeyboardButton("Отмена");
    button.setCallbackData("cancel");
    InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
    markup.setKeyboard(List.of(List.of(button)));
    return markup;
  }

  private void safeExecute(SendMessage message) {
    try {
      execute(message);
    } catch (Exception ex) {
      log.error("Failed to send message to chat {}: {}", message.getChatId(), ex.getMessage(), ex);
    }
  }

  private Integer sendLoadingMessage(Long chatId, String text) {
    try {
      Message sent = execute(new SendMessage(String.valueOf(chatId), truncateTelegramText(text)));
      return sent.getMessageId();
    } catch (Exception ex) {
      log.warn("Failed to send loading message to chat {}: {}", chatId, ex.getMessage());
      return null;
    }
  }

  private Integer sendMessageWithMarkup(Long chatId, String text, InlineKeyboardMarkup markup) {
    try {
      SendMessage msg = new SendMessage(String.valueOf(chatId), truncateTelegramText(text));
      msg.setReplyMarkup(markup);
      Message sent = execute(msg);
      return sent.getMessageId();
    } catch (Exception ex) {
      log.warn("Failed to send message with markup to chat {}: {}", chatId, ex.getMessage());
      return null;
    }
  }

  private boolean tryEditMessage(Long chatId, Integer messageId, String text, InlineKeyboardMarkup markup) {
    if (messageId == null) {
      return false;
    }
    try {
      EditMessageText edit = new EditMessageText();
      edit.setChatId(String.valueOf(chatId));
      edit.setMessageId(messageId);
      edit.setText(truncateTelegramText(text));
      edit.setReplyMarkup(markup);
      execute(edit);
      return true;
    } catch (Exception ex) {
      log.warn("Failed to edit message {} in chat {}: {}", messageId, chatId, ex.getMessage());
      return false;
    }
  }

  private Integer parseInt(String text) {
    try {
      return Integer.parseInt(text.trim());
    } catch (Exception ex) {
      return null;
    }
  }

  private Double parseDouble(String text) {
    try {
      return Double.parseDouble(text.trim().replace(",", "."));
    } catch (Exception ex) {
      return null;
    }
  }

  private String formatPlacement(Plant plant) {
    return plant.getPlacement() == PlantPlacement.OUTDOOR ? "Уличное" : "Домашнее";
  }

  private String formatWaterAmount(Plant plant, WateringRecommendation rec) {
    if (isWinterDormancyNow(plant)) {
      return "пауза полива (зимний режим)";
    }
    if (plant.getPlacement() == PlantPlacement.OUTDOOR && plant.getOutdoorAreaM2() != null && plant.getOutdoorAreaM2() > 0) {
      if (rec.waterLiters() <= 0.5 && plant.getOutdoorAreaM2() >= 2.0) {
        if (plant.getOutdoorAreaM2() >= 2.0) {
          return "минимум 0.5 л на " + plant.getOutdoorAreaM2() + " м² (уточни город/условия участка)";
        }
      }
      return formatVolume(rec.waterLiters()) + " на " + plant.getOutdoorAreaM2() + " м²";
    }
    if (rec.waterLiters() <= 0.2 && plant.getPotVolumeLiters() >= 3.0) {
      return "минимум " + formatVolume(rec.waterLiters()) + " (уточни тип растения и условия)";
    }
    return formatVolume(rec.waterLiters());
  }

  private String formatOutdoorMeta(Plant plant) {
    if (plant.getPlacement() != PlantPlacement.OUTDOOR) {
      return "не применяется";
    }
    List<String> parts = new ArrayList<>();
    if (plant.getOutdoorSoilType() != null) {
      parts.add("почва: " + plant.getOutdoorSoilType().getTitle());
    }
    if (plant.getSunExposure() != null) {
      parts.add("свет: " + plant.getSunExposure().getTitle());
    }
    if (plant.getMulched() != null) {
      parts.add("мульча: " + (plant.getMulched() ? "да" : "нет"));
    }
    if (plant.getPerennial() != null) {
      String perennialText = plant.getPerennial() ? "многолетник" : "однолетник";
      if (Boolean.TRUE.equals(plant.getPerennial()) && Boolean.TRUE.equals(plant.getWinterDormancyEnabled())) {
        perennialText += ", зимняя пауза: да";
      }
      parts.add(perennialText);
    }
    return parts.isEmpty() ? "по умолчанию" : String.join("; ", parts);
  }

  private String formatCycle(Optional<PlantCareAdvice> careAdvice, double fallbackIntervalDays) {
    if (careAdvice.isPresent()) {
      PlantCareAdvice advice = careAdvice.get();
      String note = (advice.note() == null || advice.note().isBlank()) ? "" : " (" + advice.note() + ")";
      return advice.wateringCycleDays() + " дн." + note;
    }
    return formatDays(fallbackIntervalDays);
  }

  private String formatAdditives(Plant plant, Optional<PlantCareAdvice> careAdvice) {
    if (careAdvice.isPresent() && careAdvice.get().additives() != null && !careAdvice.get().additives().isEmpty()) {
      return String.join(", ", careAdvice.get().additives());
    }
    return switch (plant.getType()) {
      case TROPICAL -> "гуматы или экстракт водорослей (слабо, 1 раз в 2-4 полива)";
      case FERN -> "янтарная кислота (редко), без концентрированных удобрений";
      case SUCCULENT -> "обычно без добавок, максимум слабое удобрение раз в 4-6 поливов";
      default -> "мягкое комплексное удобрение в слабой концентрации";
    };
  }

  private String formatSoilType(Plant plant, Optional<PlantCareAdvice> careAdvice) {
    if (careAdvice.isPresent() && careAdvice.get().soilType() != null && !careAdvice.get().soilType().isBlank()) {
      return careAdvice.get().soilType();
    }
    return switch (plant.getType()) {
      case TROPICAL -> "рыхлый влагоемкий, слабокислый";
      case FERN -> "легкий влагоемкий, воздухопроницаемый";
      case SUCCULENT -> "очень дренированный, минеральный";
      default -> "универсальный рыхлый с дренажом";
    };
  }

  private String formatSoilComposition(Plant plant, Optional<PlantCareAdvice> careAdvice) {
    if (careAdvice.isPresent()
        && careAdvice.get().soilComposition() != null
        && !careAdvice.get().soilComposition().isEmpty()) {
      return String.join(", ", careAdvice.get().soilComposition());
    }
    return switch (plant.getType()) {
      case TROPICAL -> "торф, кокос, перлит, кора";
      case FERN -> "листовая земля, торф, перлит, немного сфагнума";
      case SUCCULENT -> "грунт для кактусов, перлит, пемза/цеолит, крупный песок";
      default -> "универсальный грунт, перлит, немного коры";
    };
  }

  private String formatDays(double days) {
    return String.format(Locale.ROOT, "%.1f дн.", days);
  }

  private boolean isWinterDormancyNow(Plant plant) {
    if (plant.getPlacement() != PlantPlacement.OUTDOOR) {
      return false;
    }
    if (!Boolean.TRUE.equals(plant.getPerennial()) || !Boolean.TRUE.equals(plant.getWinterDormancyEnabled())) {
      return false;
    }
    Month month = LocalDate.now().getMonth();
    return month == Month.DECEMBER || month == Month.JANUARY || month == Month.FEBRUARY;
  }

  private String formatVolume(double liters) {
    double rounded = Math.round(liters * 100.0) / 100.0;
    if (rounded < 1.0) {
      int ml = (int) Math.round(rounded * 1000.0);
      return ml + " мл";
    }
    return String.format(Locale.ROOT, "%.2f л", rounded);
  }

  private String truncateTelegramText(String text) {
    if (text == null) {
      return "";
    }
    if (text.length() <= TELEGRAM_TEXT_LIMIT) {
      return text;
    }
    return text.substring(0, TELEGRAM_TEXT_LIMIT - 20) + "\n...\n(сообщение сокращено)";
  }

  private String monthTitle(YearMonth month) {
    String label = month.getMonth().getDisplayName(TextStyle.FULL_STANDALONE, RU_LOCALE);
    if (label.isEmpty()) {
      return month.getMonth().toString() + " " + month.getYear();
    }
    return Character.toUpperCase(label.charAt(0)) + label.substring(1) + " " + month.getYear();
  }

  private record PlantCardCacheEntry(String cardText, Instant expiresAt) {
  }
}
