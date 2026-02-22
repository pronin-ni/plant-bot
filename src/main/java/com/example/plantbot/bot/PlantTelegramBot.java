package com.example.plantbot.bot;

import com.example.plantbot.domain.Plant;
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
import com.example.plantbot.util.PlantCareAdvice;
import com.example.plantbot.util.PlantLookupResult;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.util.WeatherData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
@Slf4j
public class PlantTelegramBot extends TelegramLongPollingBot {
  private static final Locale RU_LOCALE = Locale.forLanguageTag("ru-RU");
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

  private final Map<Long, ConversationState> states = new ConcurrentHashMap<>();

  @Override
  public void onUpdateReceived(Update update) {
    if (update.hasCallbackQuery()) {
      log.info("Callback received: {}", update.getCallbackQuery().getData());
      handleCallback(update.getCallbackQuery());
      return;
    }
    if (!update.hasMessage() || !update.getMessage().hasText()) {
      return;
    }
    Message message = update.getMessage();
    User user = userService.getOrCreate(message);
    String text = message.getText().trim();
    log.info("Message received from user={} chatId={} text='{}'", user.getTelegramId(), message.getChatId(), text);

    if (text.startsWith("/")) {
      handleCommand(user, message, text);
      return;
    }

    handleConversation(user, message, text);
  }

  @Override
  public String getBotUsername() {
    return botUsername;
  }

  @Override
  public String getBotToken() {
    return botToken;
  }

  public boolean sendWateringReminder(Plant plant, WateringRecommendation rec) {
    String text = "\uD83D\uDCA7 Пора поливать \"" + plant.getName() + "\"!\n"
        + "Рекомендуемый интервал: " + formatDays(rec.intervalDays()) + "\n"
        + "Рекомендуемый объём воды: " + rec.waterLiters() + " л";
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
          "\uD83C\uDF3F Привет! Я бот для ухода за домашними растениями.\n"
              + "Команды: /add, /list, /delete, /calendar, /stats, /learning, /setcity");
      case "/add" -> startAddPlant(user, message.getChatId());
      case "/list" -> sendPlantList(user, message.getChatId());
      case "/delete" -> sendDeleteList(user, message.getChatId());
      case "/calendar" -> sendCalendar(user, message.getChatId());
      case "/stats" -> sendStats(user, message.getChatId());
      case "/learning" -> sendLearning(user, message.getChatId());
      case "/cancel" -> cancelFlow(user, message.getChatId());
      case "/setcity" -> {
        if (parts.length > 1) {
          user.setCity(parts[1].trim());
          userService.save(user);
          sendText(message.getChatId(), "\uD83C\uDF06 Город установлен: " + user.getCity());
        } else {
          ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
          state.setStep(ConversationState.Step.SET_CITY);
          sendTextWithCancel(message.getChatId(), "Введите город для погоды (например: Москва)");
        }
      }
      default -> sendText(message.getChatId(), "Не понимаю команду. Попробуй /add или /list");
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
          state.setStep(ConversationState.Step.ADD_POT);
          sendTextWithCancel(message.getChatId(), "Введите объём горшка в литрах (например: 2.5)");
        }
        log.info("Add flow: name accepted user={} name='{}'", user.getTelegramId(), state.getName());
      }
      case ADD_INTERVAL_DECISION -> sendTextWithCancel(message.getChatId(),
          "Подтверди интервал кнопками ниже: оставить найденный или ввести вручную.");
      case ADD_POT -> {
        Double volume = parseDouble(text);
        if (volume == null || volume <= 0) {
          sendTextWithCancel(message.getChatId(), "Не понимаю объём. Пример: 2.5");
          return;
        }
        state.setPotVolume(volume);
        if (state.getBaseInterval() == null) {
          state.setStep(ConversationState.Step.ADD_INTERVAL);
          sendTextWithCancel(message.getChatId(), "Введите базовый интервал полива в днях (например: 7)");
        } else {
          askForTypeDecisionOrManual(state, message.getChatId());
        }
        log.info("Add flow: pot accepted user={} pot={} interval={}",
            user.getTelegramId(), state.getPotVolume(), state.getBaseInterval());
      }
      case ADD_INTERVAL -> {
        Integer interval = parseInt(text);
        if (interval == null || interval <= 0) {
          sendTextWithCancel(message.getChatId(), "Не понимаю интервал. Пример: 7");
          return;
        }
        state.setBaseInterval(interval);
        askForTypeDecisionOrManual(state, message.getChatId());
        log.info("Add flow: manual interval set user={} interval={}", user.getTelegramId(), interval);
      }
      case ADD_TYPE_DECISION -> sendTextWithCancel(message.getChatId(),
          "Подтверди тип растения кнопками ниже: оставить найденный или выбрать вручную.");
      case SET_CITY -> {
        user.setCity(text);
        userService.save(user);
        state.reset();
        sendText(message.getChatId(), "\uD83C\uDF06 Город установлен: " + user.getCity());
      }
      default -> sendText(message.getChatId(), "Напиши /add чтобы добавить растение.");
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
      WateringRecommendation rec = recommendationService.recommend(plant, user.getCity());
      Optional<WeatherData> weather = weatherService.getCurrent(user.getCity());
      plant.setLastWateredDate(LocalDate.now());
      plant.setLastReminderDate(null);
      plantService.save(plant);
      wateringLogService.addLog(plant, LocalDate.now(), rec.intervalDays(), rec.waterLiters(),
          weather.map(WeatherData::temperatureC).orElse(null),
          weather.map(WeatherData::humidityPercent).orElse(null));
      sendText(chatId, "✅ Отметил полив для \"" + plant.getName() + "\".");
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
      sendText(chatId, "Удалил растение: \"" + name + "\"");
      log.info("Plant deleted: user={} plantId={} name='{}'", user.getTelegramId(), plantId, name);
      return;
    }

    if ("cancel".equals(data)) {
      cancelFlow(user, chatId);
      return;
    }

    if ("interval:accept".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_INTERVAL_DECISION && state.getBaseInterval() != null) {
        state.setStep(ConversationState.Step.ADD_POT);
        sendTextWithCancel(chatId, "Ок. Используем найденный интервал. Теперь введи объём горшка в литрах (например: 2.5)");
        log.info("Add flow: interval accepted user={} interval={}", user.getTelegramId(), state.getBaseInterval());
      }
      return;
    }

    if ("interval:edit".equals(data)) {
      ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
      if (state.getStep() == ConversationState.Step.ADD_INTERVAL_DECISION) {
        state.setBaseInterval(null);
        state.setStep(ConversationState.Step.ADD_POT);
        sendTextWithCancel(chatId, "Ок. Интервал введем вручную позже. Сейчас введи объём горшка в литрах (например: 2.5)");
        log.info("Add flow: interval switched to manual user={}", user.getTelegramId());
      }
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
          sendText(chatId, "Не распознал тип растения. Выбери вариант из кнопок.");
        }
      }
      return;
    }
  }

  private void startAddPlant(User user, Long chatId) {
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.reset();
    state.setStep(ConversationState.Step.ADD_NAME);
    sendTextWithCancel(chatId, "Как называется растение? Я попробую автоматически подобрать базовый интервал полива.");
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
    Plant plant = plantService.addPlant(user, state.getName(), state.getPotVolume(), state.getBaseInterval(), type);
    plant.setLookupSource(state.getLookupSource());
    plant.setLookupAt(Instant.now());
    plant = plantService.save(plant);
    state.reset();
    sendText(chatId, "\uD83C\uDF3F Растение \"" + plant.getName() + "\" добавлено!");
    log.info("Plant created: user={} plantId={} name='{}' interval={} pot={} type={}",
        user.getTelegramId(), plant.getId(), plant.getName(), plant.getBaseIntervalDays(),
        plant.getPotVolumeLiters(), plant.getType());
  }

  private void sendPlantList(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "У тебя пока нет растений. Добавь с /add");
      return;
    }
    StringBuilder sb = new StringBuilder("\uD83C\uDF31 Твои растения:\n");
    for (Plant plant : plants) {
      WateringRecommendation rec = recommendationService.recommend(plant, user.getCity());
      LocalDate due = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      Optional<PlantCareAdvice> careAdvice = openRouterPlantAdvisorService.suggestCareAdvice(plant, rec.intervalDays());

      sb.append("• ").append(plant.getName())
          .append(" — последн. полив: ").append(plant.getLastWateredDate())
          .append(", след. полив: ").append(due).append("\n")
          .append("  Рекоменд. объём: ").append(rec.waterLiters()).append(" л\n")
          .append("  Цикл: ").append(formatCycle(careAdvice, rec.intervalDays())).append("\n")
          .append("  Добавки: ").append(formatAdditives(plant, careAdvice)).append("\n");
    }
    SendMessage msg = new SendMessage(String.valueOf(chatId), sb.toString());
    msg.setReplyMarkup(listWaterButtons(plants));
    safeExecute(msg);
  }

  private void sendCalendar(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "Сначала добавь растения через /add");
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
      WateringRecommendation rec = recommendationService.recommend(plant, user.getCity());
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
      sendText(chatId, "Пока нет данных для статистики.");
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
      sendText(chatId, "Удалять пока нечего. Сначала добавь растение через /add");
      return;
    }
    SendMessage msg = new SendMessage(String.valueOf(chatId), "Выбери растение для удаления:");
    msg.setReplyMarkup(deleteButtons(plants));
    safeExecute(msg);
  }

  private void sendLearning(User user, Long chatId) {
    List<Plant> plants = plantService.list(user);
    if (plants.isEmpty()) {
      sendText(chatId, "Пока нечего анализировать.");
      return;
    }
    StringBuilder sb = new StringBuilder("\uD83E\uDDE0 Адаптивный интервал:\n");
    for (Plant plant : plants) {
      LearningInfo info = recommendationService.learningInfo(plant, user.getCity());
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
    SendMessage msg = new SendMessage(String.valueOf(chatId), text);
    safeExecute(msg);
  }

  private void sendTextWithCancel(Long chatId, String text) {
    SendMessage msg = new SendMessage(String.valueOf(chatId), text);
    msg.setReplyMarkup(cancelButton());
    safeExecute(msg);
  }

  private void cancelFlow(User user, Long chatId) {
    ConversationState state = states.computeIfAbsent(user.getTelegramId(), id -> new ConversationState());
    state.reset();
    sendText(chatId, "Ок, отменил. Если нужно — напиши /add.");
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

  private String formatDays(double days) {
    return String.format(Locale.ROOT, "%.1f дн.", days);
  }

  private String monthTitle(YearMonth month) {
    String label = month.getMonth().getDisplayName(TextStyle.FULL_STANDALONE, RU_LOCALE);
    if (label.isEmpty()) {
      return month.getMonth().toString() + " " + month.getYear();
    }
    return Character.toUpperCase(label.charAt(0)) + label.substring(1) + " " + month.getYear();
  }
}
