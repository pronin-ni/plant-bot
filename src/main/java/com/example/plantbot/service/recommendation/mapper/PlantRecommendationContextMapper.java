package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

@Component
public class PlantRecommendationContextMapper {
  private final RecommendationContextMapperSupport support;
  private final LocationContextResolver locationContextResolver;
  private final WeatherContextResolver weatherContextResolver;

  public PlantRecommendationContextMapper(
      RecommendationContextMapperSupport support,
      LocationContextResolver locationContextResolver,
      WeatherContextResolver weatherContextResolver
  ) {
    this.support = support;
    this.locationContextResolver = locationContextResolver;
    this.weatherContextResolver = weatherContextResolver;
  }

  public RecommendationRequestContext map(Plant plant, User user, RecommendationFlowType flowType, RecommendationExecutionMode mode) {
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        plant == null ? null : plant.getId(),
        flowType,
        plant == null ? null : plant.getName(),
        plant == null ? null : plant.getCategory(),
        plant == null ? null : plant.getWateringProfile(),
        plant == null ? null : plant.getPlacement(),
        plant == null ? null : plant.getType(),
        support.toProfileTypeName(plant == null ? null : plant.getWateringProfileType()),
        plant == null ? null : plant.getBaseIntervalDays(),
        plant == null ? null : plant.getPreferredWaterMl(),
        plant == null ? null : plant.getRecommendedIntervalDays(),
        plant == null ? null : plant.getRecommendedWaterVolumeMl(),
        plant == null ? null : plant.getManualWaterVolumeMl(),
        plant == null ? null : plant.getRecommendationSource(),
        plant == null ? null : plant.getGeneratedAt(),
        plant != null && plant.getManualWaterVolumeMl() != null,
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant == null ? null : plant.getSunExposure(),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getDripIrrigation(),
        plant == null ? null : plant.getGrowthStage(),
        plant == null ? null : plant.getCropType(),
        plant == null ? null : plant.getSeedStage(),
        plant == null ? null : plant.getTargetEnvironmentType(),
        plant == null ? null : plant.getSeedContainerType(),
        plant == null ? null : plant.getSeedSubstrateType(),
        plant == null ? null : plant.getSowingDate(),
        plant == null ? null : plant.getUnderCover(),
        plant == null ? null : plant.getGrowLight(),
        plant == null ? null : plant.getGerminationTemperatureC(),
        locationContext,
        weatherContextResolver.resolve(user, locationContext, flowType),
        null,
        null,
        null,
        mode,
        mode != RecommendationExecutionMode.MANUAL,
        mode != RecommendationExecutionMode.HEURISTIC && mode != RecommendationExecutionMode.BASE_PROFILE,
        true,
        true,
        false
    );
  }
}
