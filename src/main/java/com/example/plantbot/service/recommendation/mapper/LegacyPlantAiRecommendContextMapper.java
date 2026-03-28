package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.PlantAiRecommendRequest;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

@Component
public class LegacyPlantAiRecommendContextMapper {
  private final RecommendationContextMapperSupport support;
  private final WeatherContextResolver weatherContextResolver;

  public LegacyPlantAiRecommendContextMapper(
      RecommendationContextMapperSupport support,
      WeatherContextResolver weatherContextResolver
  ) {
    this.support = support;
    this.weatherContextResolver = weatherContextResolver;
  }

  public RecommendationRequestContext map(User user, PlantAiRecommendRequest request) {
    PlantEnvironmentType environmentType = request == null || request.environmentType() == null
        ? PlantEnvironmentType.INDOOR
        : request.environmentType();
    PlantCategory category = request == null || request.category() == null
        ? categoryByEnvironment(environmentType)
        : request.category();
    var locationContext = support.buildRequestLocationContext(user, null, request == null ? null : request.region());
    RecommendationExecutionMode mode = RecommendationExecutionMode.AI;
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        null,
        RecommendationFlowType.PREVIEW,
        request == null ? null : normalize(request.name()),
        category,
        environmentType,
        placementByEnvironment(environmentType),
        request == null || request.plantType() == null ? PlantType.DEFAULT : request.plantType(),
        environmentType.name(),
        request == null ? null : request.baseIntervalDays(),
        null,
        null,
        null,
        null,
        null,
        null,
        false,
        request == null ? null : request.potVolumeLiters(),
        toContainerType(request == null ? null : request.containerType()),
        null,
        toOutdoorAreaM2(request == null ? null : request.diameterCm(), environmentType),
        toOutdoorSoilType(request == null ? null : request.soilType()),
        toSunExposure(request == null ? null : request.sunExposure()),
        request == null ? null : request.greenhouse(),
        request == null ? null : request.mulched(),
        null,
        null,
        request == null ? null : request.dripIrrigation(),
        toGrowthStage(request == null ? null : request.growthStage()),
        null,
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
        null,
        null,
        null,
        mode,
        true,
        true,
        false,
        false,
        false
    );
  }

  private PlantCategory categoryByEnvironment(PlantEnvironmentType environmentType) {
    return switch (environmentType) {
      case INDOOR -> PlantCategory.HOME;
      case OUTDOOR_ORNAMENTAL -> PlantCategory.OUTDOOR_DECORATIVE;
      case OUTDOOR_GARDEN -> PlantCategory.OUTDOOR_GARDEN;
      case SEED_START -> PlantCategory.SEED_START;
    };
  }

  private PlantPlacement placementByEnvironment(PlantEnvironmentType environmentType) {
    return environmentType == PlantEnvironmentType.INDOOR ? PlantPlacement.INDOOR : PlantPlacement.OUTDOOR;
  }

  private PlantContainerType toContainerType(String raw) {
    return byName(PlantContainerType.class, raw);
  }

  private PlantGrowthStage toGrowthStage(String raw) {
    return byName(PlantGrowthStage.class, raw);
  }

  private OutdoorSoilType toOutdoorSoilType(String raw) {
    return byName(OutdoorSoilType.class, raw);
  }

  private SunExposure toSunExposure(String raw) {
    return byName(SunExposure.class, raw);
  }

  private Double toOutdoorAreaM2(Double diameterCm, PlantEnvironmentType environmentType) {
    if (diameterCm == null || diameterCm <= 0 || environmentType != PlantEnvironmentType.OUTDOOR_GARDEN) {
      return null;
    }
    double radiusMeters = (diameterCm / 100.0) / 2.0;
    return Math.PI * radiusMeters * radiusMeters;
  }

  private String normalize(String raw) {
    if (raw == null) {
      return null;
    }
    String trimmed = raw.trim();
    return trimmed.isBlank() ? null : trimmed;
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
