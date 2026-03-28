package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistenceCommand;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistenceFlow;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlan;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePolicy;
import com.example.plantbot.util.LearningInfo;
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
  private final LearningService learningService;
  private final OptionalSensorContextService optionalSensorContextService;
  private final WateringRecommendationEngine recommendationEngine;
  private final PlantRecommendationContextMapper plantRecommendationContextMapper;
  private final RecommendationFacade recommendationFacade;
  private final PreviewRecommendationResponseAdapter previewRecommendationResponseAdapter;
  private final RecommendationExplainabilityPersistenceMapper explainabilityPersistenceMapper;
  private final RecommendationPersistencePolicy recommendationPersistencePolicy;
  private final RecommendationPersistencePlanApplier recommendationPersistencePlanApplier;
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
        RecommendationRequestContext context = buildScheduledContext(plant, plant.getUser());
        var result = recommendationFacade.scheduled(context);
        WateringRecommendationResponse response = previewRecommendationResponseAdapter.adaptForRefresh(
            result,
            context
        );
        WateringRecommendationResponse legacyResponse = recommendationEngine.recommendForExistingPlant(plant.getUser(), plant);
        logScheduledDualRun(plant, response, legacyResponse);
        RecommendationPersistencePlan plan = applyRecommendation(plant, response, explainabilityPersistenceMapper.fromExplainability(result.explainability()));
        plantService.save(plant);
        if (plan != null && plan.snapshotPayload() != null) {
          recommendationSnapshotService.saveFromPayload(plant, plan.snapshotPayload());
        } else {
          recommendationSnapshotService.saveFromResponse(plant, response);
        }
        updated++;
      } catch (Exception ex) {
        log.warn("Scheduled smart watering recalculation failed for plantId={} name='{}': {}",
            plant.getId(), plant.getName(), ex.getMessage());
      }
    }
    log.info("Scheduled smart watering recalculation done. processed={}, updated={}, skippedManual={}",
        processed, updated, skippedManual);
  }

  RecommendationRequestContext buildScheduledContext(Plant plant, User user) {
    double base = plant.getBaseIntervalDays();
    var avgActual = learningService.getAverageInterval(plant);
    var smoothed = learningService.getSmoothedInterval(plant);
    Object learningContext = new LearningInfo(
        base,
        avgActual.isPresent() ? avgActual.getAsDouble() : null,
        smoothed.isPresent() ? smoothed.getAsDouble() : null,
        1.0,
        1.0,
        1.0,
        smoothed.isPresent() ? smoothed.getAsDouble() : base
    );
    Object sensorContext = optionalSensorContextService.resolveForPlant(user, plant);
    return plantRecommendationContextMapper.mapForScheduled(plant, user, learningContext, sensorContext);
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

  private void logScheduledDualRun(Plant plant,
                                   WateringRecommendationResponse unified,
                                   WateringRecommendationResponse legacy) {
    if (plant == null || unified == null || legacy == null) {
      return;
    }
    int unifiedInterval = Math.max(1, unified.recommendedIntervalDays() == null ? 1 : unified.recommendedIntervalDays());
    int legacyInterval = Math.max(1, legacy.recommendedIntervalDays() == null ? 1 : legacy.recommendedIntervalDays());
    int unifiedWater = Math.max(0, unified.recommendedWaterVolumeMl() == null
        ? (unified.recommendedWaterMl() == null ? 0 : unified.recommendedWaterMl())
        : unified.recommendedWaterVolumeMl());
    int legacyWater = Math.max(0, legacy.recommendedWaterVolumeMl() == null
        ? (legacy.recommendedWaterMl() == null ? 0 : legacy.recommendedWaterMl())
        : legacy.recommendedWaterVolumeMl());
    if (Math.abs(unifiedInterval - legacyInterval) >= 1 || Math.abs(unifiedWater - legacyWater) >= 250) {
      log.warn("Scheduled dual-run drift: plantId={} intervalNew={} intervalOld={} waterMlNew={} waterMlOld={} sourceNew={} sourceOld={}",
          plant.getId(),
          unifiedInterval,
          legacyInterval,
          unifiedWater,
          legacyWater,
          unified.source(),
          legacy.source());
    } else {
      log.debug("Scheduled dual-run parity ok: plantId={} intervalDiff={} waterDiffMl={}",
          plant.getId(),
          Math.abs(unifiedInterval - legacyInterval),
          Math.abs(unifiedWater - legacyWater));
    }
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

  private RecommendationPersistencePlan applyRecommendation(Plant plant,
                                                            WateringRecommendationResponse response,
                                                            com.example.plantbot.service.recommendation.persistence.PersistedRecommendationExplainability persistedExplainability) {
    int interval = clampInt(response.recommendedIntervalDays(), 1, 30, Math.max(1, plant.getBaseIntervalDays()));
    int waterMl = clampInt(
        response.recommendedWaterVolumeMl() == null ? response.recommendedWaterMl() : response.recommendedWaterVolumeMl(),
        50,
        10_000,
        plant.getPreferredWaterMl() == null ? 300 : plant.getPreferredWaterMl()
    );
    RecommendationSource source = response.source() == null ? RecommendationSource.FALLBACK : response.source();
    RecommendationPersistencePlan plan = recommendationPersistencePolicy.buildPlan(
        plant,
        new RecommendationPersistenceCommand(
            interval,
            waterMl,
            source,
            persistedExplainability.summary(),
            persistedExplainability.reasoningJson(),
            persistedExplainability.warningsJson(),
            response.confidence(),
            Instant.now(),
            true,
            source == RecommendationSource.MANUAL,
            source == RecommendationSource.MANUAL ? waterMl : null,
            true,
            writeJsonSafe(response.weatherContextPreview())
        ),
        RecommendationPersistenceFlow.SCHEDULED
    );
    recommendationPersistencePlanApplier.apply(plant, plan);
    return plan;
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
