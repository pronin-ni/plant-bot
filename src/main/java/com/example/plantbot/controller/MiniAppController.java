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
import com.example.plantbot.controller.dto.PlantCareAdviceResponse;
import com.example.plantbot.controller.dto.PlantLearningResponse;
import com.example.plantbot.controller.dto.PlantPhotoRequest;
import com.example.plantbot.controller.dto.PlantResponse;
import com.example.plantbot.controller.dto.PlantStatsResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.PhotoUrlSignerService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.TelegramInitDataService;
import com.example.plantbot.service.UserService;
import com.example.plantbot.service.WateringLogService;
import com.example.plantbot.service.WateringRecommendationService;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.util.PlantCareAdvice;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import java.io.IOException;
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

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MiniAppController {
  private final TelegramInitDataService telegramInitDataService;
  private final PlantService plantService;
  private final PlantRepository plantRepository;
  private final WateringRecommendationService wateringRecommendationService;
  private final WateringLogService wateringLogService;
  private final UserService userService;
  private final UserRepository userRepository;
  private final PhotoUrlSignerService photoUrlSignerService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;

  @org.springframework.beans.factory.annotation.Value("${app.public-base-url:http://localhost:8080}")
  private String publicBaseUrl;

  @org.springframework.beans.factory.annotation.Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @PostMapping("/auth/validate")
  public AuthValidateResponse validateAuth(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return new AuthValidateResponse(true, String.valueOf(user.getTelegramId()), user.getUsername(), user.getFirstName(), user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(), isAdmin(user));
  }

  @GetMapping("/plants")
  public List<PlantResponse> listPlants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return plantService.list(user).stream()
        .map(plant -> toPlantResponse(plant, user))
        .toList();
  }

  @GetMapping("/plants/{id}")
  public PlantResponse getPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @PathVariable("id") Long plantId
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    Plant plant = requireOwnedPlant(user, plantId);
    return toPlantResponse(plant, user);
  }

  @GetMapping("/plants/search")
  public List<PlantResponse> searchPlants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestParam(name = "q", required = false) String q
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    String query = q == null ? "" : q.trim();
    if (query.isBlank()) {
      return List.of();
    }
    return plantRepository.findByUserAndNameContainingIgnoreCase(user, query).stream()
        .map(plant -> toPlantResponse(plant, user))
        .toList();
  }

  @PostMapping("/plants")
  public PlantResponse createPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody CreatePlantRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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

    Plant plant = plantService.addPlant(
        user,
        request.name().trim(),
        pot,
        baseInterval,
        type,
        placement,
        request.outdoorAreaM2(),
        request.outdoorSoilType(),
        request.sunExposure(),
        request.mulched(),
        request.perennial(),
        request.winterDormancyEnabled()
    );
    return toPlantResponse(plant, user);
  }

  @PutMapping("/plants/{id}/water")
  public PlantResponse waterPlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @PathVariable("id") Long plantId
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
      @PathVariable("id") Long plantId,
      @RequestBody PlantPhotoRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return buildCalendarEvents(user, LocalDate.now(), LocalDate.now().plusDays(62));
  }

  @DeleteMapping("/plants/{id}")
  public void deletePlant(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @PathVariable("id") Long plantId
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    Plant plant = requireOwnedPlant(user, plantId);
    plantService.delete(plant);
  }

  @GetMapping("/plants/{id}/care-advice")
  public PlantCareAdviceResponse getCareAdvice(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @PathVariable("id") Long plantId
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    Plant plant = requireOwnedPlant(user, plantId);
    WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant, user);
    PlantCareAdvice advice = openRouterPlantAdvisorService
        .suggestCareAdvice(plant, rec.intervalDays())
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
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
      @RequestBody ChatAskRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    if (request == null || request.question() == null || request.question().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "question обязателен");
    }

    String question = request.question().trim();
    var answer = openRouterPlantAdvisorService.answerGardeningQuestion(user, question);
    if (answer.isEmpty()) {
      return new ChatAskResponse(false,
          "Не удалось получить ответ от OpenRouter. Проверь ключ/модель и лимиты. Если используешь free-модель, включи Free model publication в настройках OpenRouter.");
    }
    return new ChatAskResponse(true, answer.get());
  }

  @PostMapping("/users/city")
  public AuthValidateResponse updateCity(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody CityUpdateRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    if (request == null || request.city() == null || request.city().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city обязателен");
    }
    user.setCity(request.city().trim());
    user.setCityDisplayName(request.city().trim());
    user = userService.save(user);
    return new AuthValidateResponse(true, String.valueOf(user.getTelegramId()), user.getUsername(), user.getFirstName(), user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(), isAdmin(user));
  }

  @GetMapping("/calendar/sync")
  public CalendarSyncResponse getCalendarSync(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return toCalendarSyncResponse(user);
  }

  @PostMapping("/calendar/sync")
  public CalendarSyncResponse updateCalendarSync(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody CalendarSyncRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
        plant.getPotVolumeLiters(),
        plant.getOutdoorAreaM2(),
        plant.getOutdoorSoilType(),
        plant.getSunExposure(),
        plant.getMulched(),
        plant.getPerennial(),
        plant.getWinterDormancyEnabled(),
        plant.getLastWateredDate(),
        plant.getBaseIntervalDays(),
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

      Path dir = Path.of("./data/photos/" + user.getTelegramId());
      Files.createDirectories(dir);
      String fileName = String.format(Locale.ROOT, "plant-%d-%d.jpg", plant.getId(), System.currentTimeMillis());
      Path file = dir.resolve(fileName);
      Files.write(file, bytes);
      return user.getTelegramId() + "/" + fileName;
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photoBase64 невалидный");
    } catch (IOException ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить фото");
    }
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
