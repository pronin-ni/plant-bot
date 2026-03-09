package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.ApplyWateringRecommendationRequest;
import com.example.plantbot.controller.dto.ApplyWateringRecommendationResponse;
import com.example.plantbot.controller.dto.RecommendationSnapshotResponse;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.controller.dto.ha.HomeAssistantRoomsSensorsResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.RecommendationSnapshotService;
import com.example.plantbot.service.WateringRecommendationPreviewService;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.ha.HomeAssistantIntegrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/watering/recommendation")
@RequiredArgsConstructor
public class WateringRecommendationController {
  private final CurrentUserService currentUserService;
  private final PlantService plantService;
  private final WateringRecommendationPreviewService previewService;
  private final RecommendationSnapshotService recommendationSnapshotService;
  private final HomeAssistantIntegrationService homeAssistantIntegrationService;
  private final OptionalSensorContextService optionalSensorContextService;

  @PostMapping("/preview")
  public WateringRecommendationResponse preview(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody WateringRecommendationPreviewRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.plantName() == null || request.plantName().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plantName обязателен");
    }
    if (request.environmentType() == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "environmentType обязателен");
    }
    return previewService.preview(user, request);
  }

  @GetMapping("/ha/options")
  public HomeAssistantRoomsSensorsResponse haOptions(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return homeAssistantIntegrationService.getRoomsAndSensors(user);
  }

  @PostMapping("/ha/context-preview")
  public WateringSensorContextDto previewHaContext(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody WateringRecommendationPreviewRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return optionalSensorContextService.resolveForPreview(user, request);
  }

  @PostMapping("/{plantId}/refresh")
  public WateringRecommendationResponse refresh(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    return previewService.refreshForExistingPlant(user, plant);
  }

  @PostMapping("/weather/preview")
  public WeatherContextPreviewResponse previewWeather(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody WateringRecommendationPreviewRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return previewService.previewWeatherContext(user, request);
  }

  @PostMapping("/{plantId}/apply")
  public ApplyWateringRecommendationResponse apply(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestBody ApplyWateringRecommendationRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "request обязателен");
    }
    if (request.recommendedIntervalDays() == null || request.recommendedIntervalDays() <= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recommendedIntervalDays должен быть > 0");
    }
    if (request.recommendedWaterMl() == null || request.recommendedWaterMl() <= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recommendedWaterMl должен быть > 0");
    }
    return previewService.applyRecommendation(user, plant, request);
  }

  @GetMapping("/{plantId}/history")
  public List<RecommendationSnapshotResponse> history(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestParam(name = "limit", required = false, defaultValue = "20") Integer limit
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    int normalizedLimit = Math.max(1, Math.min(100, limit == null ? 20 : limit));
    return recommendationSnapshotService.listForPlant(plant, normalizedLimit).stream()
        .map(snapshot -> new RecommendationSnapshotResponse(
            snapshot.getId(),
            snapshot.getPlant().getId(),
            snapshot.getSource(),
            snapshot.getRecommendedIntervalDays(),
            snapshot.getRecommendedWaterVolumeMl(),
            snapshot.getSummary(),
            snapshot.getReasoningJson(),
            snapshot.getWarningsJson(),
            snapshot.getWeatherContextSnapshotJson(),
            snapshot.getConfidenceScore(),
            snapshot.getGeneratedAt(),
            snapshot.getCreatedAt()
        ))
        .toList();
  }

  private Plant requireOwnedPlant(User user, Long plantId) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (plant.getUser() == null || !plant.getUser().getId().equals(user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
    }
    return plant;
  }
}
