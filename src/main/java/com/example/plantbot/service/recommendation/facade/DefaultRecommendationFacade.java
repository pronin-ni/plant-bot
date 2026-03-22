package com.example.plantbot.service.recommendation.facade;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.GrowthStage;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantPlacementType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.service.WateringRecommendationEngine;
import com.example.plantbot.service.recommendation.mapper.PreviewSensorSelectionContext;
import com.example.plantbot.service.recommendation.mapper.RecommendationResultMapper;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DefaultRecommendationFacade implements RecommendationFacade {
  private final WateringRecommendationEngine wateringRecommendationEngine;
  private final RecommendationResultMapper recommendationResultMapper;

  @Autowired
  public DefaultRecommendationFacade(
      WateringRecommendationEngine wateringRecommendationEngine,
      RecommendationResultMapper recommendationResultMapper
  ) {
    this.wateringRecommendationEngine = wateringRecommendationEngine;
    this.recommendationResultMapper = recommendationResultMapper;
  }

  @Override
  public RecommendationResult preview(RecommendationRequestContext context) {
    WateringRecommendationPreviewRequest request = toPreviewRequest(context);
    return recommendationResultMapper.fromPreviewResponse(
        wateringRecommendationEngine.recommendPreview(toPreviewUser(context), request),
        context == null ? null : context.mode(),
        context != null && context.manualOverrideActive()
    );
  }

  @Override
  public RecommendationResult runtime(RecommendationRequestContext context) {
    throw unsupported("runtime", context);
  }

  @Override
  public RecommendationResult scheduled(RecommendationRequestContext context) {
    throw unsupported("scheduled", context);
  }

  @Override
  public RecommendationResult explain(RecommendationRequestContext context) {
    throw unsupported("explain", context);
  }

  private UnsupportedOperationException unsupported(String operation, RecommendationRequestContext context) {
    String flow = context == null || context.flowType() == null ? "unknown" : context.flowType().name();
    return new UnsupportedOperationException(
        "Unified recommendation facade skeleton is not wired yet. operation=" + operation + ", flowType=" + flow
    );
  }

  private WateringRecommendationPreviewRequest toPreviewRequest(RecommendationRequestContext context) {
    PreviewSensorSelectionContext sensorSelection = sensorSelection(context);
    return new WateringRecommendationPreviewRequest(
        context == null ? null : context.plantName(),
        toWateringProfileType(context == null ? null : context.wateringProfileType()),
        toPlantPlacementType(context == null ? null : context.placement()),
        context == null ? null : context.manualWaterVolumeMl(),
        context == null ? null : context.allowWeather(),
        context == null ? null : context.allowAI(),
        context == null || context.locationContext() == null ? null : context.locationContext().regionLabel(),
        context == null ? null : context.environmentType(),
        context == null ? null : context.potVolumeLiters(),
        context == null ? null : context.baseIntervalDays(),
        context == null ? null : context.containerType(),
        context == null ? null : context.containerVolumeLiters(),
        context == null || context.sunExposure() == null ? null : context.sunExposure().name(),
        context == null || context.outdoorSoilType() == null ? null : context.outdoorSoilType().name(),
        context == null ? null : context.cropType(),
        context == null || context.growthStage() == null ? null : context.growthStage().name(),
        toGrowthStage(context == null ? null : context.growthStage()),
        context == null ? null : context.greenhouse(),
        context == null ? null : context.mulched(),
        context == null ? null : context.dripIrrigation(),
        context == null ? null : context.outdoorAreaM2(),
        toSoilType(context == null ? null : context.outdoorSoilType()),
        toSunlightExposure(context == null ? null : context.sunExposure()),
        sensorSelection == null ? null : sensorSelection.haRoomId(),
        sensorSelection == null ? null : sensorSelection.haRoomName(),
        sensorSelection == null ? null : sensorSelection.temperatureSensorEntityId(),
        sensorSelection == null ? null : sensorSelection.humiditySensorEntityId(),
        sensorSelection == null ? null : sensorSelection.soilMoistureSensorEntityId(),
        sensorSelection == null ? null : sensorSelection.illuminanceSensorEntityId(),
        context == null || context.locationContext() == null ? null : context.locationContext().cityLabel(),
        toRecommendationMode(context == null ? null : context.mode())
    );
  }

  private User toPreviewUser(RecommendationRequestContext context) {
    if (context == null || context.userId() == null) {
      return null;
    }
    User user = new User();
    user.setId(context.userId());
    LocationContext locationContext = context.locationContext();
    if (locationContext != null && locationContext.locationSource() == LocationSource.USER_DEFAULT) {
      user.setCity(firstNonBlank(locationContext.cityLabel(), locationContext.canonicalQuery(), locationContext.displayName()));
      user.setCityDisplayName(locationContext.displayName());
      user.setCityLat(locationContext.lat());
      user.setCityLon(locationContext.lon());
    }
    return user;
  }

  private PreviewSensorSelectionContext sensorSelection(RecommendationRequestContext context) {
    if (context == null || !(context.sensorContext() instanceof PreviewSensorSelectionContext selection)) {
      return null;
    }
    return selection;
  }

  private WateringProfileType toWateringProfileType(String profileType) {
    return byName(WateringProfileType.class, profileType);
  }

  private PlantPlacementType toPlantPlacementType(PlantPlacement placement) {
    if (placement == null) {
      return null;
    }
    return switch (placement) {
      case INDOOR -> PlantPlacementType.INDOOR;
      case OUTDOOR -> PlantPlacementType.OUTDOOR;
    };
  }

  private GrowthStage toGrowthStage(Enum<?> growthStage) {
    return growthStage == null ? null : byName(GrowthStage.class, growthStage.name());
  }

  private SoilType toSoilType(OutdoorSoilType soilType) {
    return soilType == null ? null : byName(SoilType.class, soilType.name());
  }

  private SunlightExposure toSunlightExposure(SunExposure sunExposure) {
    if (sunExposure == null) {
      return null;
    }
    return switch (sunExposure) {
      case FULL_SUN -> SunlightExposure.HIGH;
      case PARTIAL_SHADE -> SunlightExposure.MEDIUM;
      case SHADE -> SunlightExposure.LOW;
    };
  }

  private RecommendationMode toRecommendationMode(Enum<?> mode) {
    return mode == null ? null : byName(RecommendationMode.class, mode.name());
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
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
}
