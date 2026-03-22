package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

@Component
public class PreviewRecommendationContextMapper {
  private final RecommendationContextMapperSupport support;

  public PreviewRecommendationContextMapper(RecommendationContextMapperSupport support) {
    this.support = support;
  }

  public RecommendationRequestContext map(User user, WateringRecommendationPreviewRequest request) {
    PlantEnvironmentType environmentType = request == null ? null : request.environmentType();
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
        null,
        null,
        request == null ? null : request.greenhouse(),
        request == null ? null : request.mulched(),
        request == null ? null : request.dripIrrigation(),
        null,
        request == null ? null : request.cropType(),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        support.buildRequestLocationContext(user, request == null ? null : request.city(), request == null ? null : request.region()),
        null,
        null,
        null,
        null,
        support.toExecutionMode(request == null ? null : request.mode()),
        true,
        true,
        true,
        true,
        false
    );
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
