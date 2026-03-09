package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.AuthValidateResponse;
import com.example.plantbot.controller.dto.CalendarEventResponse;
import com.example.plantbot.controller.dto.CalendarSyncRequest;
import com.example.plantbot.controller.dto.CalendarSyncResponse;
import com.example.plantbot.controller.dto.CityUpdateRequest;
import com.example.plantbot.controller.dto.ChatAskRequest;
import com.example.plantbot.controller.dto.ChatAskResponse;
import com.example.plantbot.controller.dto.CreatePlantRequest;
import com.example.plantbot.controller.dto.PhotoUploadResponse;
import com.example.plantbot.controller.dto.PlantPresetSuggestionResponse;
import com.example.plantbot.controller.dto.PlantCareAdviceResponse;
import com.example.plantbot.controller.dto.PlantProfileSuggestionResponse;
import com.example.plantbot.controller.dto.PlantLearningResponse;
import com.example.plantbot.controller.dto.PlantPhotoRequest;
import com.example.plantbot.controller.dto.PlantAiRecommendRequest;
import com.example.plantbot.controller.dto.PlantAiRecommendResponse;
import com.example.plantbot.controller.dto.PlantResponse;
import com.example.plantbot.controller.dto.PlantStatsResponse;
import com.example.plantbot.controller.dto.OpenRouterRuntimeSettingsResponse;
import com.example.plantbot.controller.dto.AssistantChatHistoryItemResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.PlantPresetCatalogService;
import com.example.plantbot.service.PhotoUrlSignerService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.OpenRouterUserSettingsService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.UserService;
import com.example.plantbot.service.AssistantChatHistoryService;
import com.example.plantbot.service.WateringLogService;
import com.example.plantbot.service.WateringRecommendationService;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.util.PlantCareAdvice;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MiniAppController {
  private final CurrentUserService currentUserService;
  private final PlantService plantService;
  private final PlantRepository plantRepository;
  private final WateringRecommendationService wateringRecommendationService;
  private final WateringLogService wateringLogService;
  private final UserService userService;
  private final UserRepository userRepository;
  private final AssistantChatHistoryService assistantChatHistoryService;
  private final PlantCatalogService plantCatalogService;
  private final PlantPresetCatalogService plantPresetCatalogService;
  private final PhotoUrlSignerService photoUrlSignerService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @org.springframework.beans.factory.annotation.Value("${app.public-base-url:http://localhost:8080}")
  private String publicBaseUrl;

  @org.springframework.beans.factory.annotation.Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @org.springframework.beans.factory.annotation.Value("${app.photo-upload.max-long-side-px:1600}")
  private int photoMaxLongSidePx;

  @org.springframework.beans.factory.annotation.Value("${app.photo-upload.jpeg-quality:0.82}")
  private float photoJpegQuality;

  @org.springframework.beans.factory.annotation.Value("${app.photo-upload.max-file-bytes:900000}")
  private int photoMaxFileBytes;

  @PostMapping("/auth/validate")
  public AuthValidateResponse validateAuth(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return new AuthValidateResponse(true, String.valueOf(user.getTelegramId()), user.getUsername(), user.getFirstName(), user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(), isAdmin(user));
  }

  @GetMapping("/plants")
  public List<PlantResponse> listPlants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return plantService.list(user).stream()
        .map(plant -> toPlantResponse(plant, user))
        .toList();
  }

  @GetMapping("/plants/{id}")
  public PlantResponse getPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("id") Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    return toPlantResponse(plant, user);
  }

  @GetMapping("/plants/search")
  public List<PlantResponse> searchPlants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(name = "category", required = false) PlantCategory category
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String query = q == null ? "" : q.trim();
    if (query.isBlank()) {
      return List.of();
    }
    List<Plant> plants = category == null
        ? plantRepository.findByUserAndNameContainingIgnoreCase(user, query)
        : plantRepository.findByUserAndCategoryAndNameContainingIgnoreCase(user, category, query);
    return plants.stream()
        .map(plant -> toPlantResponse(plant, user))
        .toList();
  }

  @GetMapping("/plants/presets")
  public List<PlantPresetSuggestionResponse> getPlantPresets(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "category", required = false) PlantCategory category,
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(name = "limit", required = false, defaultValue = "12") Integer limit
  ) {
    // Авторизация обязательна, даже если это справочный поиск пресетов.
    currentUserService.resolve(authentication, initData);

    PlantCategory effectiveCategory = category == null ? PlantCategory.HOME : category;
    int safeLimit = limit == null ? 12 : limit;
    return plantPresetCatalogService.searchByCategory(effectiveCategory, q, safeLimit).stream()
        .map(name -> new PlantPresetSuggestionResponse(name, effectiveCategory, plantPresetCatalogService.isPopular(name)))
        .toList();
  }

  @PostMapping("/plants")
  public PlantResponse createPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody CreatePlantRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.name() == null || request.name().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name обязателен");
    }
    int baseInterval = request.baseIntervalDays() == null ? 7 : request.baseIntervalDays();
    if (baseInterval <= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "baseIntervalDays должен быть > 0");
    }
    double pot = request.potVolumeLiters() == null ? 1.0 : request.potVolumeLiters();
    if (pot <= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "potVolumeLiters должен быть > 0");
    }
    PlantPlacement placement = request.placement() == null ? PlantPlacement.INDOOR : request.placement();
    PlantType type = request.type() == null ? PlantType.DEFAULT : request.type();
    PlantCategory category = request.category() == null
        ? (placement == PlantPlacement.OUTDOOR ? PlantCategory.OUTDOOR_DECORATIVE : PlantCategory.HOME)
        : request.category();

    Plant plant = plantService.addPlant(
        user,
        request.name().trim(),
        pot,
        baseInterval,
        type,
        placement,
        category,
        request.outdoorAreaM2(),
        request.outdoorSoilType(),
        request.sunExposure(),
        request.mulched(),
        request.perennial(),
        request.winterDormancyEnabled(),
        request.preferredWaterMl()
    );
    return toPlantResponse(plant, user);
  }

  @PutMapping("/plants/{id}/water")
  public PlantResponse waterPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("id") Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);

    WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
    LocalDate today = LocalDate.now();
    plant.setLastWateredDate(today);
    plant.setLastReminderDate(null);
    plantService.save(plant);
    wateringLogService.addLog(plant, today, rec.intervalDays(), rec.waterLiters(), null, null);
    return toPlantResponse(plant, user);
  }

  @PostMapping(value = "/plants/{id}/photo", consumes = MediaType.APPLICATION_JSON_VALUE)
  public PhotoUploadResponse uploadPhoto(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("id") Long plantId,
      @RequestBody PlantPhotoRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    if (request == null || request.photoBase64() == null || request.photoBase64().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photoBase64 обязателен");
    }
    String photoUrl = savePhoto(user, plant, request.photoBase64());
    plant.setPhotoUrl(photoUrl);
    plantService.save(plant);
    return new PhotoUploadResponse(true, buildPlantPhotoUrl(plant));
  }

  @GetMapping(value = "/plants/{id}/photo")
  public ResponseEntity<byte[]> getPhoto(
      @PathVariable("id") Long plantId,
      @RequestParam(name = "exp", required = false) Long exp,
      @RequestParam(name = "sig", required = false) String sig
  ) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (!photoUrlSignerService.isValid(plantId, plant.getPhotoUrl(), exp, sig)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к фото");
    }
    Path photoFile = resolvePhotoPath(plant);
    if (photoFile == null || !Files.exists(photoFile)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Фото не найдено");
    }
    try {
      byte[] bytes = Files.readAllBytes(photoFile);
      MediaType mediaType = MediaType.IMAGE_JPEG;
      return ResponseEntity.ok()
          .contentType(mediaType)
          .body(bytes);
    } catch (IOException ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось прочитать фото");
    }
  }

  @GetMapping("/calendar")
  public List<CalendarEventResponse> getCalendar(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return buildCalendarEvents(user, LocalDate.now(), LocalDate.now().plusDays(62));
  }

  @DeleteMapping("/plants/{id}")
  public void deletePlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("id") Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    plantService.delete(plant);
  }

  @GetMapping("/plants/{id}/care-advice")
  public PlantCareAdviceResponse getCareAdvice(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("id") Long plantId,
      @RequestParam(name = "refresh", required = false, defaultValue = "false") boolean refresh
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
    PlantCareAdvice advice = openRouterPlantAdvisorService
        .suggestCareAdvice(plant, rec.intervalDays(), refresh)
        .orElse(new PlantCareAdvice(
            Math.max(1, (int) Math.round(rec.intervalDays())),
            List.of(),
            "Не указано",
            List.of(),
            "Нет дополнительных рекомендаций",
            "Heuristic"
        ));
    return new PlantCareAdviceResponse(
        advice.wateringCycleDays(),
        advice.additives(),
        advice.soilType(),
        advice.soilComposition(),
        advice.note(),
        advice.source()
    );
  }

  @GetMapping("/stats")
  public List<PlantStatsResponse> getStats(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    List<Plant> plants = plantService.list(user);
    LocalDate today = LocalDate.now();
    return plants.stream().map(plant -> {
      WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
      int interval = Math.max(1, (int) Math.floor(rec.intervalDays()));
      LocalDate due = plant.getLastWateredDate().plusDays(interval);
      boolean overdue = due.isBefore(today);
      long overdueDays = overdue ? ChronoUnit.DAYS.between(due, today) : 0;
      Double avg = wateringRecommendationService.learningInfo(plant, user).avgActualIntervalDays();
      long total = wateringLogService.countAll(plant);
      return new PlantStatsResponse(plant.getId(), plant.getName(), avg, total, overdue, overdueDays);
    }).toList();
  }

  @GetMapping("/learning")
  public List<PlantLearningResponse> getLearning(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return plantService.list(user).stream().map(plant -> {
      LearningInfo info = wateringRecommendationService.learningInfo(plant, user);
      return new PlantLearningResponse(
          plant.getId(),
          plant.getName(),
          info.baseIntervalDays(),
          info.avgActualIntervalDays(),
          info.smoothedIntervalDays(),
          info.seasonFactor(),
          info.weatherFactor(),
          info.potFactor(),
          info.finalIntervalDays(),
          plant.getLookupSource()
      );
    }).toList();
  }

  @PostMapping("/assistant/chat")
  public ChatAskResponse askAssistant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody ChatAskRequest request
  ) {
    return askAssistantInternal(initData, authentication, request);
  }

  @PostMapping("/openrouter/send")
  public ChatAskResponse sendOpenRouter(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody ChatAskRequest request
  ) {
    return askAssistantInternal(initData, authentication, request);
  }

  private ChatAskResponse askAssistantInternal(
      String initData,
      Authentication authentication,
      ChatAskRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.question() == null || request.question().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "question обязателен");
    }

    String question = request.question().trim();
    var answer = openRouterPlantAdvisorService.answerGardeningQuestion(user, question, request.photoBase64());
    if (answer.isEmpty()) {
      return new ChatAskResponse(false,
          "Не удалось получить ответ от OpenRouter. Попросите администратора проверить глобальный ключ/модели и лимиты.",
          null);
    }
    assistantChatHistoryService.saveAndTrim(user, question, answer.get().answer(), answer.get().model());
    return new ChatAskResponse(true, answer.get().answer(), answer.get().model());
  }

  @GetMapping("/assistant/history")
  public List<AssistantChatHistoryItemResponse> getAssistantHistory(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "limit", defaultValue = "50") int limit
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return assistantChatHistoryService.getRecent(user, limit).stream()
        .map(item -> new AssistantChatHistoryItemResponse(
            item.getId(),
            item.getQuestion(),
            item.getAnswer(),
            item.getModel(),
            item.getCreatedAt()
        ))
        .toList();
  }

  @DeleteMapping("/assistant/history")
  public Map<String, Object> clearAssistantHistory(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    assistantChatHistoryService.clearHistory(user);
    return Map.of("ok", true);
  }

  @PostMapping("/plants/ai-recommend")
  public PlantAiRecommendResponse aiRecommendPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody PlantAiRecommendRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.name() == null || request.name().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name обязателен");
    }

    String sizeHint;
    if (request.category() == PlantCategory.OUTDOOR_GARDEN) {
      sizeHint = "высота " + safeNum(request.heightCm(), 0) + " см, диаметр " + safeNum(request.diameterCm(), 0) + " см";
    } else {
      sizeHint = "горшок " + safeNum(request.potVolumeLiters(), 0) + " л";
    }

    var recommendation = openRouterPlantAdvisorService
        .suggestWizardRecommendation(user, request.name().trim(), request.category(), sizeHint)
        .orElseGet(() -> new OpenRouterPlantAdvisorService.WizardWateringRecommendation(
            7,
            300,
            "рассеянный свет",
            "универсальный грунт",
            "Проверьте влажность почвы перед поливом.",
            "Heuristic"
        ));

    return new PlantAiRecommendResponse(
        recommendation.wateringFrequencyDays(),
        recommendation.wateringVolumeMl(),
        recommendation.light(),
        recommendation.soil(),
        recommendation.notes(),
        recommendation.source()
    );
  }

  @GetMapping("/plants/suggest-profile")
  public PlantProfileSuggestionResponse suggestPlantProfile(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "name") String name
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (name == null || name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name обязателен");
    }
    var suggested = plantCatalogService.suggestIntervalDays(user, name.trim());
    if (suggested.isEmpty()) {
      return new PlantProfileSuggestionResponse(false, 7, PlantType.DEFAULT, "Heuristic");
    }
    var value = suggested.get();
    int interval = Math.max(1, value.baseIntervalDays());
    PlantType type = value.suggestedType() == null ? PlantType.DEFAULT : value.suggestedType();
    String source = value.source() == null || value.source().isBlank() ? "Heuristic" : value.source();
    return new PlantProfileSuggestionResponse(true, interval, type, source);
  }

  @PostMapping("/users/city")
  public AuthValidateResponse updateCity(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody CityUpdateRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.city() == null || request.city().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city обязателен");
    }
    user.setCity(request.city().trim());
    user.setCityDisplayName(request.city().trim());
    user = userService.save(user);
    return new AuthValidateResponse(true, String.valueOf(user.getTelegramId()), user.getUsername(), user.getFirstName(), user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(), isAdmin(user));
  }

  @GetMapping("/settings/openrouter")
  public OpenRouterRuntimeSettingsResponse getOpenRouterRuntimeSettings(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (user.getId() == null) {
      throw new IllegalStateException("Unauthorized user context");
    }

    var models = openRouterUserSettingsService.resolveGlobalModels();
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    boolean hasApiKey = apiKey != null && !apiKey.isBlank();
    return new OpenRouterRuntimeSettingsResponse(
        models.chatModel(),
        models.photoRecognitionModel(),
        hasApiKey
    );
  }

  @GetMapping("/calendar/sync")
  public CalendarSyncResponse getCalendarSync(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return toCalendarSyncResponse(user);
  }

  @PostMapping("/calendar/sync")
  public CalendarSyncResponse updateCalendarSync(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody CalendarSyncRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    boolean enabled = request != null && Boolean.TRUE.equals(request.enabled());
    user.setCalendarSyncEnabled(enabled);
    user = userService.save(user);
    return toCalendarSyncResponse(user);
  }

  @GetMapping(value = "/calendar/ics/{token}", produces = "text/calendar; charset=UTF-8")
  public ResponseEntity<String> getCalendarIcs(@PathVariable("token") String token) {
    User user = userRepository.findByCalendarToken(token)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Календарь не найден"));
    if (!Boolean.TRUE.equals(user.getCalendarSyncEnabled())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Синхронизация календаря отключена");
    }
    LocalDate start = LocalDate.now();
    LocalDate end = start.plusDays(365);
    List<CalendarEventResponse> events = buildCalendarEvents(user, start, end);

    StringBuilder ics = new StringBuilder();
    ics.append("BEGIN:VCALENDAR\r\n")
        .append("VERSION:2.0\r\n")
        .append("PRODID:-//PlantBot//Watering Calendar//RU\r\n")
        .append("CALSCALE:GREGORIAN\r\n")
        .append("METHOD:PUBLISH\r\n")
        .append("X-WR-CALNAME:Мои растения — Полив\r\n");
    String stamp = utcNowStamp();
    for (CalendarEventResponse event : events) {
      String uid = "plantbot-" + user.getTelegramId() + "-" + event.plantId() + "-" + event.date();
      String date = event.date().toString().replace("-", "");
      ics.append("BEGIN:VEVENT\r\n")
          .append("UID:").append(uid).append("\r\n")
          .append("DTSTAMP:").append(stamp).append("\r\n")
          .append("DTSTART;VALUE=DATE:").append(date).append("\r\n")
          .append("DTEND;VALUE=DATE:").append(event.date().plusDays(1).toString().replace("-", "")).append("\r\n")
          .append("SUMMARY:Полив: ").append(escapeIcs(event.plantName())).append("\r\n")
          .append("DESCRIPTION:Напоминание о поливе растения ").append(escapeIcs(event.plantName())).append("\r\n")
          .append("END:VEVENT\r\n");
    }
    ics.append("END:VCALENDAR\r\n");

    return ResponseEntity.ok()
        .header("Cache-Control", "public, max-age=300")
        .body(ics.toString());
  }

  private Plant requireOwnedPlant(User user, Long plantId) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (!plant.getUser().getId().equals(user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
    }
    return plant;
  }

  private PlantResponse toPlantResponse(Plant plant, User user) {
    if (user.getCalendarToken() == null || user.getCalendarToken().isBlank()) {
      user = userService.save(user);
    }
    WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
    int interval = Math.max(1, (int) Math.floor(rec.intervalDays()));
    LocalDate next = plant.getLastWateredDate().plusDays(interval);
    int ml = (int) Math.round(rec.waterLiters() * 1000.0);
    return new PlantResponse(
        plant.getId(),
        plant.getName(),
        plant.getPlacement(),
        plant.getCategory(),
        plant.getPotVolumeLiters(),
        plant.getOutdoorAreaM2(),
        plant.getOutdoorSoilType(),
        plant.getSunExposure(),
        plant.getMulched(),
        plant.getPerennial(),
        plant.getWinterDormancyEnabled(),
        plant.getLastWateredDate(),
        plant.getBaseIntervalDays(),
        plant.getPreferredWaterMl(),
        next,
        ml,
        plant.getType(),
        plant.getPhotoUrl() == null || plant.getPhotoUrl().isBlank() ? null : buildPlantPhotoUrl(plant),
        plant.getCreatedAt()
    );
  }

  private String savePhoto(User user, Plant plant, String photoBase64) {
    try {
      String raw = photoBase64.trim();
      if (raw.contains(",")) {
        raw = raw.substring(raw.indexOf(',') + 1);
      }
      byte[] bytes = Base64.getDecoder().decode(raw);
      byte[] processedBytes = compressPhoto(bytes);

      Path dir = Path.of("./data/photos/" + user.getTelegramId());
      Files.createDirectories(dir);
      String fileName = String.format(Locale.ROOT, "plant-%d-%d.jpg", plant.getId(), System.currentTimeMillis());
      Path file = dir.resolve(fileName);
      Files.write(file, processedBytes);
      return user.getTelegramId() + "/" + fileName;
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photoBase64 невалидный");
    } catch (IOException ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить фото");
    }
  }

  private byte[] compressPhoto(byte[] originalBytes) {
    try {
      BufferedImage src = ImageIO.read(new ByteArrayInputStream(originalBytes));
      if (src == null) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не удалось прочитать изображение");
      }

      BufferedImage rgb = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
      Graphics2D g = rgb.createGraphics();
      g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
      g.drawImage(src, 0, 0, null);
      g.dispose();

      BufferedImage scaled = scaleDown(rgb, Math.max(320, photoMaxLongSidePx));
      float quality = Math.min(0.95f, Math.max(0.55f, photoJpegQuality));
      byte[] jpeg = writeJpeg(scaled, quality);

      int maxBytes = Math.max(200_000, photoMaxFileBytes);
      while (jpeg.length > maxBytes && quality > 0.56f) {
        quality -= 0.08f;
        jpeg = writeJpeg(scaled, quality);
      }
      return jpeg;
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось обработать фото");
    }
  }

  private BufferedImage scaleDown(BufferedImage src, int maxLongSide) {
    int width = src.getWidth();
    int height = src.getHeight();
    int longest = Math.max(width, height);
    if (longest <= maxLongSide) {
      return src;
    }

    double ratio = maxLongSide / (double) longest;
    int targetW = Math.max(1, (int) Math.round(width * ratio));
    int targetH = Math.max(1, (int) Math.round(height * ratio));

    BufferedImage out = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = out.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    g.drawImage(src, 0, 0, targetW, targetH, null);
    g.dispose();
    return out;
  }

  private byte[] writeJpeg(BufferedImage image, float quality) throws IOException {
    Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
    if (!writers.hasNext()) {
      throw new IOException("JPEG writer is unavailable");
    }
    ImageWriter writer = writers.next();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
      writer.setOutput(ios);
      ImageWriteParam params = writer.getDefaultWriteParam();
      if (params.canWriteCompressed()) {
        params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        params.setCompressionQuality(Math.min(0.98f, Math.max(0.5f, quality)));
      }
      writer.write(null, new IIOImage(image, null, null), params);
    } finally {
      writer.dispose();
    }
    return out.toByteArray();
  }

  private String buildPlantPhotoUrl(Plant plant) {
    return photoUrlSignerService.buildSignedPhotoUrl(plant.getId(), plant.getPhotoUrl());
  }

  private Path resolvePhotoPath(Plant plant) {
    String photoRef = plant.getPhotoUrl();
    if (photoRef == null || photoRef.isBlank()) {
      return null;
    }

    if (photoRef.startsWith("./") || photoRef.startsWith("/")) {
      return Paths.get(photoRef).normalize();
    }

    String[] parts = photoRef.split("/", 2);
    if (parts.length == 2) {
      return Path.of("./data/photos/" + parts[0]).resolve(parts[1]).normalize();
    }
    return null;
  }

  private List<CalendarEventResponse> buildCalendarEvents(User user, LocalDate start, LocalDate end) {
    List<CalendarEventResponse> events = new ArrayList<>();
    List<Plant> plants = plantService.list(user);
    for (Plant plant : plants) {
      WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
      int step = Math.max(1, (int) Math.floor(rec.intervalDays()));
      LocalDate due = plant.getLastWateredDate().plusDays(step);
      LocalDate next = due;

      if (!due.isAfter(start) && !start.isAfter(end)) {
        events.add(new CalendarEventResponse(start, plant.getId(), plant.getName()));
      }

      while (!next.isAfter(end)) {
        if (!next.isBefore(start)) {
          events.add(new CalendarEventResponse(next, plant.getId(), plant.getName()));
        }
        next = next.plusDays(step);
      }
    }
    events.sort(Comparator.comparing(CalendarEventResponse::date).thenComparing(CalendarEventResponse::plantName));
    return events;
  }

  private CalendarSyncResponse toCalendarSyncResponse(User user) {
    String base = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
    String https = base + "/api/calendar/ics/" + user.getCalendarToken();
    String webcal = https.replaceFirst("^https?://", "webcal://");
    return new CalendarSyncResponse(Boolean.TRUE.equals(user.getCalendarSyncEnabled()), webcal, https);
  }

  private static String safeNum(Double value, int scale) {
    if (value == null) {
      return "0";
    }
    return scale <= 0 ? String.valueOf(Math.round(value)) : String.format(Locale.ROOT, "%." + scale + "f", value);
  }

  private boolean isAdmin(User user) {
    return user != null && adminTelegramId != null && adminTelegramId > 0 && adminTelegramId.equals(user.getTelegramId());
  }

  private String utcNowStamp() {
    LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
    return String.format(Locale.ROOT, "%04d%02d%02dT%02d%02d%02dZ",
        now.getYear(), now.getMonthValue(), now.getDayOfMonth(),
        now.getHour(), now.getMinute(), now.getSecond());
  }

  private String escapeIcs(String value) {
    if (value == null) {
      return "";
    }
    return value
        .replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\n", "\\n");
  }
}
