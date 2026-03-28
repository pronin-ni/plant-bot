package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;

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
        plant != null && Boolean.TRUE.equals(plant.getManualOverrideActive()),
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant == null ? null : plant.getSunExposure(),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getPerennial(),
        plant == null ? null : plant.getWinterDormancyEnabled(),
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

  public RecommendationRequestContext mapForRefresh(Plant plant, User user, Object sensorContext) {
    RecommendationExecutionMode mode = RecommendationExecutionMode.HYBRID;
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    boolean allowWeather = plant == null || !Boolean.FALSE.equals(plant.getWeatherAdjustmentEnabled());
    boolean allowAi = plant == null || !Boolean.FALSE.equals(plant.getAiWateringEnabled());
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        plant == null ? null : plant.getId(),
        RecommendationFlowType.RUNTIME,
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
        plant != null && Boolean.TRUE.equals(plant.getManualOverrideActive()),
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant != null && plant.getSunExposure() != null ? plant.getSunExposure() : support.toSunExposure(plant == null ? null : plant.getSunlightExposure()),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getPerennial(),
        plant == null ? null : plant.getWinterDormancyEnabled(),
        plant == null ? null : plant.getDripIrrigation(),
        plant != null && plant.getGrowthStage() != null ? plant.getGrowthStage() : support.toPlantGrowthStage(plant == null ? null : plant.getGrowthStageV2()),
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
        allowWeather ? weatherContextResolver.resolve(user, locationContext, RecommendationFlowType.RUNTIME) : null,
        sensorContext,
        null,
        null,
        mode,
        allowAi,
        allowWeather,
        sensorContext != null,
        true,
        false
    );
  }

  public RecommendationRequestContext mapForQuick(Plant plant, User user, Object learningContext, boolean allowSensors) {
    RecommendationExecutionMode mode = RecommendationExecutionMode.HEURISTIC;
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        plant == null ? null : plant.getId(),
        RecommendationFlowType.RUNTIME,
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
        plant != null && Boolean.TRUE.equals(plant.getManualOverrideActive()),
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant != null && plant.getSunExposure() != null ? plant.getSunExposure() : support.toSunExposure(plant == null ? null : plant.getSunlightExposure()),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getPerennial(),
        plant == null ? null : plant.getWinterDormancyEnabled(),
        plant == null ? null : plant.getDripIrrigation(),
        plant != null && plant.getGrowthStage() != null ? plant.getGrowthStage() : support.toPlantGrowthStage(plant == null ? null : plant.getGrowthStageV2()),
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
        null,
        null,
        buildSeasonContext(),
        learningContext,
        mode,
        false,
        false,
        allowSensors,
        true,
        false
    );
  }

  public RecommendationRequestContext mapForNotification(Plant plant, User user, Object learningContext) {
    RecommendationExecutionMode mode = RecommendationExecutionMode.WEATHER_ADJUSTED;
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        plant == null ? null : plant.getId(),
        RecommendationFlowType.NOTIFICATION,
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
        plant != null && Boolean.TRUE.equals(plant.getManualOverrideActive()),
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant != null && plant.getSunExposure() != null ? plant.getSunExposure() : support.toSunExposure(plant == null ? null : plant.getSunlightExposure()),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getPerennial(),
        plant == null ? null : plant.getWinterDormancyEnabled(),
        plant == null ? null : plant.getDripIrrigation(),
        plant != null && plant.getGrowthStage() != null ? plant.getGrowthStage() : support.toPlantGrowthStage(plant == null ? null : plant.getGrowthStageV2()),
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
        weatherContextResolver.resolve(user, locationContext, RecommendationFlowType.NOTIFICATION),
        null,
        buildSeasonContext(),
        learningContext,
        mode,
        false,
        true,
        false,
        true,
        false
    );
  }

  public RecommendationRequestContext mapForScheduled(Plant plant, User user, Object learningContext, Object sensorContext) {
    RecommendationExecutionMode mode = RecommendationExecutionMode.HYBRID;
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    boolean allowWeather = plant == null || !Boolean.FALSE.equals(plant.getWeatherAdjustmentEnabled());
    boolean allowAi = plant == null || !Boolean.FALSE.equals(plant.getAiWateringEnabled());
    return new RecommendationRequestContext(
        user == null ? null : user.getId(),
        plant == null ? null : plant.getId(),
        RecommendationFlowType.SCHEDULED_RECALCULATION,
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
        plant != null && Boolean.TRUE.equals(plant.getManualOverrideActive()),
        plant == null ? null : plant.getPotVolumeLiters(),
        plant == null ? null : plant.getContainerType(),
        plant == null ? null : plant.getContainerVolumeLiters(),
        plant == null ? null : plant.getOutdoorAreaM2(),
        plant == null ? null : plant.getOutdoorSoilType(),
        plant != null && plant.getSunExposure() != null ? plant.getSunExposure() : support.toSunExposure(plant == null ? null : plant.getSunlightExposure()),
        plant == null ? null : plant.getGreenhouse(),
        plant == null ? null : plant.getMulched(),
        plant == null ? null : plant.getPerennial(),
        plant == null ? null : plant.getWinterDormancyEnabled(),
        plant == null ? null : plant.getDripIrrigation(),
        plant != null && plant.getGrowthStage() != null ? plant.getGrowthStage() : support.toPlantGrowthStage(plant == null ? null : plant.getGrowthStageV2()),
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
        allowWeather ? weatherContextResolver.resolve(user, locationContext, RecommendationFlowType.SCHEDULED_RECALCULATION) : null,
        sensorContext,
        buildSeasonContext(),
        learningContext,
        mode,
        allowAi,
        allowWeather,
        sensorContext != null,
        true,
        true
    );
  }

  private Map<String, Object> buildSeasonContext() {
    return Map.of(
        "month", LocalDate.now().getMonthValue(),
        "seasonIndex", seasonIndex(LocalDate.now())
    );
  }

  private int seasonIndex(LocalDate date) {
    int month = date.getMonthValue();
    if (month == 12 || month <= 2) return 0;
    if (month <= 5) return 1;
    if (month <= 8) return 2;
    return 3;
  }
}
