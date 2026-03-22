package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

@Component
public class SeedRecommendationContextMapper {
  private final RecommendationContextMapperSupport support;

  public SeedRecommendationContextMapper(RecommendationContextMapperSupport support) {
    this.support = support;
  }

  public RecommendationRequestContext map(User user, SeedRecommendationPreviewRequest request) {
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        null,
        RecommendationFlowType.PREVIEW,
        request == null ? null : request.plantName(),
        PlantCategory.SEED_START,
        PlantEnvironmentType.SEED_START,
        PlantPlacement.INDOOR,
        PlantType.DEFAULT,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        false,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        request == null ? SeedStage.SOWN : request.seedStage(),
        request == null ? null : request.targetEnvironmentType(),
        request == null ? null : request.seedContainerType(),
        request == null ? null : request.seedSubstrateType(),
        request == null ? null : request.sowingDate(),
        request == null ? null : request.underCover(),
        request == null ? null : request.growLight(),
        request == null ? null : request.germinationTemperatureC(),
        support.buildRequestLocationContext(user, null, request == null ? null : request.region()),
        null,
        null,
        null,
        null,
        null,
        true,
        false,
        false,
        false,
        false
    );
  }
}
