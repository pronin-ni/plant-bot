package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

@Component
public class PreviewRecommendationContextMapper {
  private final RecommendationContextMapperSupport support;
  private final LocationContextResolver locationContextResolver;
  private final WeatherContextResolver weatherContextResolver;

  public PreviewRecommendationContextMapper(
      RecommendationContextMapperSupport support,
      LocationContextResolver locationContextResolver,
      WeatherContextResolver weatherContextResolver
  ) {
    this.support = support;
    this.locationContextResolver = locationContextResolver;
    this.weatherContextResolver = weatherContextResolver;
  }

  public RecommendationRequestContext map(User user, WateringRecommendationPreviewRequest request) {
    PlantEnvironmentType environmentType = request == null ? null : request.environmentType();
    var locationContext = locationContextResolver.resolveForPreview(user, request);
    RecommendationExecutionMode executionMode = support.toExecutionMode(request == null ? null : request.mode());
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        null,
        RecommendationFlowType.PREVIEW,
        request == null ? null : request.plantName(),
        categoryByEnvironment(environmentType),
        environmentType,
        placementByEnvironment(environmentType),
        PlantType.DEFAULT,
        support.toProfileTypeName(request == null ? null : request.wateringProfileType()),
        request == null ? null : request.baseIntervalDays(),
        null,
        null,
        null,
        request == null ? null : request.manualWaterVolumeMl(),
        null,
        null,
        false,
        request == null ? null : request.potVolumeLiters(),
        request == null ? null : request.containerType(),
        request == null ? null : request.containerVolume(),
        request == null ? null : request.outdoorAreaM2(),
        toOutdoorSoilType(request),
        toSunExposure(request),
        request == null ? null : request.greenhouse(),
        request == null ? null : request.mulched(),
        request == null ? null : request.dripIrrigation(),
        toPlantGrowthStage(request),
        request == null ? null : request.cropType(),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        locationContext,
        weatherContextResolver.resolve(user, locationContext, RecommendationFlowType.PREVIEW),
        toSensorSelectionContext(request),
        null,
        null,
        executionMode,
        executionMode != RecommendationExecutionMode.MANUAL,
        executionMode != RecommendationExecutionMode.HEURISTIC && executionMode != RecommendationExecutionMode.BASE_PROFILE,
        true,
        true,
        false
    );
  }

  private OutdoorSoilType toOutdoorSoilType(WateringRecommendationPreviewRequest request) {
    if (request == null) {
      return null;
    }
    if (request.soilTypeV2() != null) {
      return byName(OutdoorSoilType.class, request.soilTypeV2().name());
    }
    return byName(OutdoorSoilType.class, request.soilType());
  }

  private SunExposure toSunExposure(WateringRecommendationPreviewRequest request) {
    if (request == null) {
      return null;
    }
    if (request.sunlightExposure() != null) {
      return switch (request.sunlightExposure()) {
        case HIGH -> SunExposure.FULL_SUN;
        case MEDIUM -> SunExposure.PARTIAL_SHADE;
        case LOW -> SunExposure.SHADE;
      };
    }
    return byName(SunExposure.class, request.sunExposure());
  }

  private PlantGrowthStage toPlantGrowthStage(WateringRecommendationPreviewRequest request) {
    if (request == null) {
      return null;
    }
    if (request.growthStageV2() != null) {
      return byName(PlantGrowthStage.class, request.growthStageV2().name());
    }
    return byName(PlantGrowthStage.class, request.growthStage());
  }

  private PreviewSensorSelectionContext toSensorSelectionContext(WateringRecommendationPreviewRequest request) {
    if (request == null) {
      return null;
    }
    return new PreviewSensorSelectionContext(
        request.haRoomId(),
        request.haRoomName(),
        request.temperatureSensorEntityId(),
        request.humiditySensorEntityId(),
        request.soilMoistureSensorEntityId(),
        request.illuminanceSensorEntityId()
    );
  }

  private <E extends Enum<E>> E byName(Class<E> enumType, String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return Enum.valueOf(enumType, raw.trim().toUpperCase());
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }

  private PlantCategory categoryByEnvironment(PlantEnvironmentType environmentType) {
    if (environmentType == null) {
      return null;
    }
    return switch (environmentType) {
      case INDOOR -> PlantCategory.HOME;
      case OUTDOOR_ORNAMENTAL -> PlantCategory.OUTDOOR_DECORATIVE;
      case OUTDOOR_GARDEN -> PlantCategory.OUTDOOR_GARDEN;
      case SEED_START -> PlantCategory.SEED_START;
    };
  }

  private PlantPlacement placementByEnvironment(PlantEnvironmentType environmentType) {
    if (environmentType == null) {
      return null;
    }
    return environmentType == PlantEnvironmentType.INDOOR ? PlantPlacement.INDOOR : PlantPlacement.OUTDOOR;
  }
}
