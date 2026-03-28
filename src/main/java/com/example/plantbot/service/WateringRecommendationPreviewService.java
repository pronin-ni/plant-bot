package com.example.plantbot.service;

import com.example.plantbot.controller.dto.ApplyWateringRecommendationRequest;
import com.example.plantbot.controller.dto.ApplyWateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistenceCommand;
import com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistenceFlow;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlan;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePolicy;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
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
  private final OptionalSensorContextService optionalSensorContextService;
  private final PreviewRecommendationContextMapper previewRecommendationContextMapper;
  private final PlantRecommendationContextMapper plantRecommendationContextMapper;
  private final RecommendationFacade recommendationFacade;
  private final PreviewRecommendationResponseAdapter previewRecommendationResponseAdapter;
  private final RecommendationExplainabilityPersistenceMapper explainabilityPersistenceMapper;
  private final RecommendationPersistencePolicy recommendationPersistencePolicy;
  private final RecommendationPersistencePlanApplier recommendationPersistencePlanApplier;
  private final ObjectMapper objectMapper;

  public WateringRecommendationResponse preview(User user, WateringRecommendationPreviewRequest request) {
    RecommendationRequestContext context = buildPreviewContext(user, request);
    if (context.flowType() == null) {
      throw new IllegalStateException("Preview recommendation context must have flowType");
    }
    return previewRecommendationResponseAdapter.adapt(
        recommendationFacade.preview(context),
        context
    );
  }

  RecommendationRequestContext buildPreviewContext(User user, WateringRecommendationPreviewRequest request) {
    return previewRecommendationContextMapper.map(user, request);
  }

  public WateringRecommendationResponse refreshForExistingPlant(User user, Plant plant) {
    RecommendationRequestContext context = buildRefreshContext(user, plant);
    var result = recommendationFacade.runtime(context);
    WateringRecommendationResponse response = previewRecommendationResponseAdapter.adaptForRefresh(
        result,
        context
    );
    applyRecommendationToPlant(plant, response, explainabilityPersistenceMapper.fromExplainability(result.explainability()));
    plantService.save(plant);
    recommendationSnapshotService.saveFromResponse(plant, response);
    aiTextCacheInvalidationService.invalidateForPlantMutation(user, plant, "watering_recommendation_refresh");
    return response;
  }

  RecommendationRequestContext buildRefreshContext(User user, Plant plant) {
    WateringSensorContextDto sensorContext = optionalSensorContextService.resolveForPlant(user, plant);
    return plantRecommendationContextMapper.mapForRefresh(plant, user, sensorContext);
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
    Instant eventTime = Instant.now();
    var persistedExplainability = explainabilityPersistenceMapper.fromSummaryOnly(request.summary());
    RecommendationPersistencePlan persistencePlan = recommendationPersistencePolicy.buildPlan(
        plant,
        new RecommendationPersistenceCommand(
            interval,
            waterMl,
            source,
            persistedExplainability.summary(),
            persistedExplainability.reasoningJson(),
            persistedExplainability.warningsJson(),
            null,
            eventTime,
            true,
            source == RecommendationSource.MANUAL,
            waterMl,
            true,
            null
        ),
        RecommendationPersistenceFlow.APPLY
    );

    recommendationPersistencePlanApplier.apply(plant, persistencePlan);
    plantService.save(plant);
    recommendationSnapshotService.saveFromPayload(plant, persistencePlan.snapshotPayload());
    aiTextCacheInvalidationService.invalidateForPlantMutation(user, plant, "manual_recommendation_apply");

    return new ApplyWateringRecommendationResponse(
        true,
        plant.getId(),
        persistencePlan.appliedSource(),
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

  private void applyRecommendationToPlant(Plant plant,
                                          WateringRecommendationResponse response,
                                          com.example.plantbot.service.recommendation.persistence.PersistedRecommendationExplainability persistedExplainability) {
    int interval = clampInt(defaultInt(response.recommendedIntervalDays(), plant.getBaseIntervalDays()), 1, 30);
    int waterMl = clampInt(defaultInt(response.recommendedWaterVolumeMl(), defaultInt(response.recommendedWaterMl(), plant.getPreferredWaterMl() == null ? 300 : plant.getPreferredWaterMl())), 50, 10_000);
    plant.setRecommendedIntervalDays(interval);
    plant.setRecommendedWaterVolumeMl(waterMl);
    plant.setRecommendationSource(response.source());
    plant.setRecommendationSummary(persistedExplainability == null ? response.summary() : persistedExplainability.summary());
    plant.setRecommendationReasoningJson(persistedExplainability == null ? toJson(response.reasoning()) : persistedExplainability.reasoningJson());
    plant.setRecommendationWarningsJson(persistedExplainability == null ? toJson(response.warnings()) : persistedExplainability.warningsJson());
    plant.setConfidenceScore(response.confidence());
    plant.setGeneratedAt(Instant.now());
    boolean manualOverride = response.source() == RecommendationSource.MANUAL;
    plant.setManualOverrideActive(manualOverride);
    plant.setManualWaterVolumeMl(manualOverride ? waterMl : null);
    plant.setLastRecommendationSource(response.source());
    plant.setLastRecommendedIntervalDays(interval);
    plant.setLastRecommendedWaterMl(waterMl);
    plant.setLastRecommendationSummary(persistedExplainability == null ? response.summary() : persistedExplainability.summary());
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
