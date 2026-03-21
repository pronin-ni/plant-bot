package com.example.plantbot.service;

import com.example.plantbot.controller.dto.ApplyWateringRecommendationRequest;
import com.example.plantbot.controller.dto.ApplyWateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class WateringRecommendationPreviewService {
  private final WateringRecommendationEngine recommendationEngine;
  private final PlantService plantService;
  private final OutdoorWeatherContextService outdoorWeatherContextService;
  private final RecommendationSnapshotService recommendationSnapshotService;
  private final AiTextCacheInvalidationService aiTextCacheInvalidationService;
  private final ObjectMapper objectMapper;

  public WateringRecommendationResponse preview(User user, WateringRecommendationPreviewRequest request) {
    return recommendationEngine.recommendPreview(user, request);
  }

  public WateringRecommendationResponse refreshForExistingPlant(User user, Plant plant) {
    WateringRecommendationResponse response = recommendationEngine.recommendForExistingPlant(user, plant);
    applyRecommendationToPlant(plant, response);
    plantService.save(plant);
    recommendationSnapshotService.saveFromResponse(plant, response);
    aiTextCacheInvalidationService.invalidateForPlantMutation(user, plant, "watering_recommendation_refresh");
    return response;
  }

  public WeatherContextPreviewResponse previewWeatherContext(User user, WateringRecommendationPreviewRequest request) {
    var weather = outdoorWeatherContextService.resolve(user, request.city(), request.region());
    return new WeatherContextPreviewResponse(
        weather.available(),
        weather.degraded(),
        weather.fallbackUsed(),
        weather.staleFallbackUsed(),
        weather.providerUsed() == null ? null : weather.providerUsed().name(),
        weather.city(),
        weather.region(),
        weather.temperatureNowC(),
        weather.humidityNowPercent(),
        weather.precipitationLast24hMm(),
        weather.precipitationForecastNext72hMm(),
        weather.maxTemperatureNext3DaysC(),
        weather.windNowMs(),
        weather.confidence().name(),
        weather.warnings()
    );
  }

  public ApplyWateringRecommendationResponse applyRecommendation(User user,
                                                                 Plant plant,
                                                                 ApplyWateringRecommendationRequest request) {
    int interval = clampInt(defaultInt(request.recommendedIntervalDays(), plant.getBaseIntervalDays()), 1, 30);
    int waterMl = clampInt(defaultInt(request.recommendedWaterMl(), plant.getPreferredWaterMl() == null ? 300 : plant.getPreferredWaterMl()), 50, 10_000);
    RecommendationSource source = request.source() == null ? RecommendationSource.MANUAL : request.source();

    plant.setBaseIntervalDays(interval);
    plant.setPreferredWaterMl(waterMl);
    plant.setLastRecommendationSource(source);
    plant.setLastRecommendedIntervalDays(interval);
    plant.setLastRecommendedWaterMl(waterMl);
    plant.setLastRecommendationSummary(request.summary());
    plant.setLastRecommendationUpdatedAt(Instant.now());
    plant.setManualWaterVolumeMl(waterMl);
    plant.setRecommendedIntervalDays(interval);
    plant.setRecommendedWaterVolumeMl(waterMl);
    plant.setRecommendationSource(source);
    plant.setRecommendationSummary(request.summary());
    plant.setGeneratedAt(Instant.now());
    plantService.save(plant);
    recommendationSnapshotService.saveManualSnapshot(plant, source, interval, waterMl, request.summary());
    aiTextCacheInvalidationService.invalidateForPlantMutation(user, plant, "manual_recommendation_apply");

    return new ApplyWateringRecommendationResponse(
        true,
        plant.getId(),
        source,
        plant.getBaseIntervalDays(),
        plant.getPreferredWaterMl(),
        plant.getLastRecommendationUpdatedAt()
    );
  }

  private int defaultInt(Integer value, int defaultValue) {
    return value == null ? defaultValue : value;
  }

  private int clampInt(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private void applyRecommendationToPlant(Plant plant, WateringRecommendationResponse response) {
    int interval = clampInt(defaultInt(response.recommendedIntervalDays(), plant.getBaseIntervalDays()), 1, 30);
    int waterMl = clampInt(defaultInt(response.recommendedWaterVolumeMl(), defaultInt(response.recommendedWaterMl(), plant.getPreferredWaterMl() == null ? 300 : plant.getPreferredWaterMl())), 50, 10_000);
    plant.setRecommendedIntervalDays(interval);
    plant.setRecommendedWaterVolumeMl(waterMl);
    plant.setRecommendationSource(response.source());
    plant.setRecommendationSummary(response.summary());
    plant.setRecommendationReasoningJson(toJson(response.reasoning()));
    plant.setRecommendationWarningsJson(toJson(response.warnings()));
    plant.setConfidenceScore(response.confidence());
    plant.setGeneratedAt(Instant.now());
    plant.setLastRecommendationSource(response.source());
    plant.setLastRecommendedIntervalDays(interval);
    plant.setLastRecommendedWaterMl(waterMl);
    plant.setLastRecommendationSummary(response.summary());
    plant.setLastRecommendationUpdatedAt(Instant.now());
  }

  private String toJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      return null;
    }
  }
}
