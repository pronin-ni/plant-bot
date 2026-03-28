package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;

@Component
public class SeedRecommendationContextMapper {
  private final RecommendationContextMapperSupport support;
  private final LocationContextResolver locationContextResolver;
  private final WeatherContextResolver weatherContextResolver;

  public SeedRecommendationContextMapper(
      RecommendationContextMapperSupport support,
      LocationContextResolver locationContextResolver,
      WeatherContextResolver weatherContextResolver
  ) {
    this.support = support;
    this.locationContextResolver = locationContextResolver;
    this.weatherContextResolver = weatherContextResolver;
  }

  public RecommendationRequestContext map(User user, SeedRecommendationPreviewRequest request) {
    var locationContext = locationContextResolver.resolveForSeedPreview(user, request);
    SeedStage stage = request == null || request.seedStage() == null ? SeedStage.SOWN : request.seedStage();
    PlantEnvironmentType targetEnvironment = request == null ? null : request.targetEnvironmentType();
    RecommendationExecutionMode mode = RecommendationExecutionMode.AI;
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
        null,
        null,
        stage,
        targetEnvironment,
        request == null ? null : request.seedContainerType(),
        request == null ? null : request.seedSubstrateType(),
        request == null ? null : request.sowingDate(),
        request == null ? null : request.underCover(),
        request == null ? null : request.growLight(),
        request == null ? null : request.germinationTemperatureC(),
        locationContext,
        null,
        null,
        buildSeedSeasonContext(request, stage, targetEnvironment),
        null,
        mode,
        true,
        false,
        false,
        false,
        false
    );
  }

  private Map<String, Object> buildSeedSeasonContext(SeedRecommendationPreviewRequest request,
                                                     SeedStage stage,
                                                     PlantEnvironmentType targetEnvironment) {
    return Map.of(
        "seedStage", stage == null ? SeedStage.SOWN.name() : stage.name(),
        "targetEnvironmentType", targetEnvironment == null ? nullValue() : targetEnvironment.name(),
        "hasSowingDate", request != null && request.sowingDate() != null,
        "currentMonth", LocalDate.now().getMonthValue()
    );
  }

  private String nullValue() {
    return "";
  }
}
