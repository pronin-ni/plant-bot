package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledWateringRecalculationService {
  private final PlantService plantService;
  private final WateringRecommendationEngine recommendationEngine;
  private final RecommendationSnapshotService recommendationSnapshotService;
  private final OutdoorWeatherContextService outdoorWeatherContextService;
  private final ObjectMapper objectMapper;

  @Scheduled(cron = "${scheduler.smart-watering-cron:0 20 4 * * *}")
  public void scheduledRecalculation() {
    List<Plant> plants = plantService.listAll();
    int processed = 0;
    int updated = 0;
    int skippedManual = 0;
    for (Plant plant : plants) {
      processed++;
      if (plant.getUser() == null) {
        continue;
      }
      if (isManualOverride(plant)) {
        skippedManual++;
        continue;
      }
      if (!shouldRecalculate(plant)) {
        continue;
      }
      try {
        WateringRecommendationResponse response = recommendationEngine.recommendForExistingPlant(plant.getUser(), plant);
        applyRecommendation(plant, response);
        plantService.save(plant);
        recommendationSnapshotService.saveFromResponse(plant, response);
        updated++;
      } catch (Exception ex) {
        log.warn("Scheduled smart watering recalculation failed for plantId={} name='{}': {}",
            plant.getId(), plant.getName(), ex.getMessage());
      }
    }
    log.info("Scheduled smart watering recalculation done. processed={}, updated={}, skippedManual={}",
        processed, updated, skippedManual);
  }

  private boolean shouldRecalculate(Plant plant) {
    Instant generatedAt = plant.getGeneratedAt();
    if (generatedAt == null) {
      return true;
    }
    if (isSeasonChanged(generatedAt)) {
      return true;
    }
    if (generatedAt.isBefore(Instant.now().minus(24, ChronoUnit.HOURS))) {
      return true;
    }
    if (isOutdoor(plant)) {
      return hasSignificantWeatherChange(plant);
    }
    return false;
  }

  private boolean hasSignificantWeatherChange(Plant plant) {
    User user = plant.getUser();
    NormalizedWeatherContext current = outdoorWeatherContextService.resolve(user, plant.getCity(), plant.getRegion());
    if (!current.available()) {
      return false;
    }

    RecommendationSnapshot latest = recommendationSnapshotService.getLatestForPlant(plant);
    if (latest == null || latest.getWeatherContextSnapshotJson() == null || latest.getWeatherContextSnapshotJson().isBlank()) {
      return true;
    }

    try {
      JsonNode prev = objectMapper.readTree(latest.getWeatherContextSnapshotJson());
      double prevTemp = readDouble(prev, "temperatureNowC");
      double prevHumidity = readDouble(prev, "humidityNowPercent");
      double prevPrecip24 = readDouble(prev, "precipitationLast24hMm");
      double prevPrecipForecast = readDouble(prev, "precipitationForecastMm");
      double prevMaxTemp = readDouble(prev, "maxTemperatureNext3DaysC");

      return diff(current.temperatureNowC(), prevTemp) >= 4.0
          || diff(current.humidityNowPercent(), prevHumidity) >= 15.0
          || diff(current.precipitationLast24hMm(), prevPrecip24) >= 4.0
          || diff(current.precipitationForecastNext72hMm(), prevPrecipForecast) >= 6.0
          || diff(current.maxTemperatureNext3DaysC(), prevMaxTemp) >= 4.0;
    } catch (Exception ex) {
      return true;
    }
  }

  private double readDouble(JsonNode node, String field) {
    JsonNode n = node.path(field);
    if (n.isMissingNode() || n.isNull()) {
      return 0.0;
    }
    return n.asDouble(0.0);
  }

  private double diff(Double current, double previous) {
    return Math.abs((current == null ? 0.0 : current) - previous);
  }

  private boolean isSeasonChanged(Instant generatedAt) {
    LocalDate then = generatedAt.atZone(ZoneOffset.UTC).toLocalDate();
    LocalDate now = LocalDate.now(ZoneOffset.UTC);
    return seasonIndex(then) != seasonIndex(now);
  }

  private int seasonIndex(LocalDate date) {
    int month = date.getMonthValue();
    if (month == 12 || month <= 2) return 0;
    if (month <= 5) return 1;
    if (month <= 8) return 2;
    return 3;
  }

  private boolean isOutdoor(Plant plant) {
    PlantEnvironmentType type = plant.getWateringProfile();
    if (type == null) {
      return false;
    }
    return type == PlantEnvironmentType.OUTDOOR_ORNAMENTAL || type == PlantEnvironmentType.OUTDOOR_GARDEN;
  }

  private boolean isManualOverride(Plant plant) {
    RecommendationSource source = plant.getRecommendationSource();
    RecommendationSource lastSource = plant.getLastRecommendationSource();
    return source == RecommendationSource.MANUAL || lastSource == RecommendationSource.MANUAL;
  }

  private void applyRecommendation(Plant plant, WateringRecommendationResponse response) {
    int interval = clampInt(response.recommendedIntervalDays(), 1, 30, Math.max(1, plant.getBaseIntervalDays()));
    int waterMl = clampInt(
        response.recommendedWaterVolumeMl() == null ? response.recommendedWaterMl() : response.recommendedWaterVolumeMl(),
        50,
        10_000,
        plant.getPreferredWaterMl() == null ? 300 : plant.getPreferredWaterMl()
    );
    RecommendationSource source = response.source() == null ? RecommendationSource.FALLBACK : response.source();
    Instant now = Instant.now();

    plant.setRecommendedIntervalDays(interval);
    plant.setRecommendedWaterVolumeMl(waterMl);
    plant.setRecommendationSource(source);
    plant.setRecommendationSummary(response.summary());
    plant.setRecommendationReasoningJson(writeJsonSafe(response.reasoning()));
    plant.setRecommendationWarningsJson(writeJsonSafe(response.warnings()));
    plant.setConfidenceScore(response.confidence());
    plant.setGeneratedAt(now);

    plant.setLastRecommendationSource(source);
    plant.setLastRecommendedIntervalDays(interval);
    plant.setLastRecommendedWaterMl(waterMl);
    plant.setLastRecommendationSummary(response.summary());
    plant.setLastRecommendationUpdatedAt(now);

    // Keep next watering schedule up to date for non-manual mode.
    plant.setBaseIntervalDays(interval);
    plant.setPreferredWaterMl(waterMl);
  }

  private int clampInt(Integer value, int min, int max, int fallback) {
    int base = value == null ? fallback : value;
    return Math.max(min, Math.min(max, base));
  }

  private String writeJsonSafe(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return null;
    }
  }
}
