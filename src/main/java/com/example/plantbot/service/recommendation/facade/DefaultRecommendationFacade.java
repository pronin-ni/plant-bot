package com.example.plantbot.service.recommendation.facade;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.GrowthStage;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantPlacementType;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.service.SeedRecommendationService;
import com.example.plantbot.service.WateringRecommendationEngine;
import com.example.plantbot.service.recommendation.mapper.PreviewSensorSelectionContext;
import com.example.plantbot.service.recommendation.mapper.RecommendationResultMapper;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
import com.example.plantbot.util.WateringRecommendation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class DefaultRecommendationFacade implements RecommendationFacade {
  private final WateringRecommendationEngine wateringRecommendationEngine;
  private final SeedRecommendationService seedRecommendationService;
  private final RecommendationResultMapper recommendationResultMapper;
  private final LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate;

  @Autowired
  public DefaultRecommendationFacade(
      WateringRecommendationEngine wateringRecommendationEngine,
      SeedRecommendationService seedRecommendationService,
      RecommendationResultMapper recommendationResultMapper,
      LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate
  ) {
    this.wateringRecommendationEngine = wateringRecommendationEngine;
    this.seedRecommendationService = seedRecommendationService;
    this.recommendationResultMapper = recommendationResultMapper;
    this.legacyRuntimeRecommendationDelegate = legacyRuntimeRecommendationDelegate;
  }

  @Override
  public RecommendationResult preview(RecommendationRequestContext context) {
    if (isSeedMode(context)) {
      return seedRecommendationService.previewResult(toPreviewUser(context), context);
    }
    WateringRecommendationPreviewRequest request = toPreviewRequest(context, null);
    return recommendationResultMapper.fromPreviewResponse(
        wateringRecommendationEngine.recommendPreview(toPreviewUser(context), request),
        context == null ? null : context.mode(),
        context != null && context.manualOverrideActive()
    );
  }

  @Override
  public RecommendationResult runtime(RecommendationRequestContext context) {
    RecommendationExecutionMode mode = context == null || context.mode() == null
        ? RecommendationExecutionMode.HYBRID
        : context.mode();
    Plant runtimePlant = toRuntimePlant(context);
    User runtimeUser = toRuntimeUser(context);
    boolean quickProfile = !allowAi(context) && !allowWeather(context);
    WateringRecommendation runtime = quickProfile
        ? recommendQuickProfile(runtimePlant, runtimeUser, allowSensors(context))
        : legacyRuntimeRecommendationDelegate.recommendProfile(
            runtimePlant,
            runtimeUser,
            allowWeather(context),
            allowAi(context),
            allowSensors(context)
        );
    String source = context != null && context.recommendationSource() != null
        ? context.recommendationSource().name()
        : quickProfile ? "HEURISTIC" : "HYBRID";
    RecommendationExplainability explainability = buildRuntimeExplainability(context, mode, source, quickProfile);
    return new RecommendationResult(
        (int) Math.max(1, Math.floor(runtime.intervalDays())),
        (int) Math.round(runtime.waterLiters() * 1000.0),
        source,
        mode,
        null,
        explainability,
        context == null ? null : context.weatherContext(),
        context == null ? null : context.sensorContext(),
        Instant.now(),
        context != null && context.manualOverrideActive()
    );
  }

  private RecommendationExplainability buildRuntimeExplainability(RecommendationRequestContext context,
                                                                  RecommendationExecutionMode mode,
                                                                  String source,
                                                                  boolean quickProfile) {
    String weatherContribution = weatherContribution(context);
    String sensorContribution = sensorContribution(context);
    String learningContribution = learningContribution(context);
    String manualContribution = context != null && context.manualOverrideActive()
        ? "Используется ручная настройка полива."
        : null;
    String aiContribution = !quickProfile && allowAi(context) ? "Профиль допускает AI-коррекцию." : null;
    return new RecommendationExplainability(
        source,
        mode,
        runtimeSummary(context, quickProfile),
        runtimeReasoning(context, quickProfile),
        runtimeWarnings(context, quickProfile),
        List.of(new RecommendationFactor("RUNTIME", "Execution profile", quickProfile ? "quick" : "runtime", null, true)),
        weatherContribution,
        sensorContribution,
        aiContribution,
        learningContribution,
        manualContribution
    );
  }

  private String runtimeSummary(RecommendationRequestContext context, boolean quickProfile) {
    if (context != null && context.manualOverrideActive()) {
      return quickProfile
          ? "Быстрая рекомендация учитывает ручную настройку полива."
          : "Рекомендация рассчитана с учётом ручной настройки полива.";
    }
    if (quickProfile) {
      return "Быстрая рекомендация рассчитана по локальным эвристикам и истории полива.";
    }
    if (allowWeather(context)) {
      return "Рекомендация рассчитана с учётом погоды и истории полива.";
    }
    return "Рекомендация рассчитана по текущему состоянию растения и истории полива.";
  }

  private List<String> runtimeReasoning(RecommendationRequestContext context, boolean quickProfile) {
    java.util.ArrayList<String> reasoning = new java.util.ArrayList<>();
    if (context != null && context.baseIntervalDays() != null) {
      reasoning.add("Базовый интервал: " + context.baseIntervalDays() + " дн.");
    }
    if (context != null && context.preferredWaterMl() != null) {
      reasoning.add("Базовый объём: " + context.preferredWaterMl() + " мл.");
    }
    if (quickProfile) {
      reasoning.add("Использован быстрый профиль без внешних погодных вызовов.");
    }
    if (learningContribution(context) != null) {
      reasoning.add("Учтена история полива растения.");
    }
    if (!quickProfile && weatherContribution(context) != null) {
      reasoning.add("Учтён текущий погодный контекст.");
    }
    if (sensorContribution(context) != null) {
      reasoning.add("Учтены локальные датчики.");
    }
    if (context != null && context.manualOverrideActive()) {
      reasoning.add("Активна ручная настройка полива.");
    }
    return reasoning;
  }

  private List<String> runtimeWarnings(RecommendationRequestContext context, boolean quickProfile) {
    java.util.ArrayList<String> warnings = new java.util.ArrayList<>();
    if (quickProfile) {
      warnings.add("Быстрый режим не использует внешние AI и weather API.");
    }
    if (context != null && context.weatherContext() != null && context.weatherContext().warnings() != null) {
      warnings.addAll(context.weatherContext().warnings());
    }
    return warnings;
  }

  private String weatherContribution(RecommendationRequestContext context) {
    if (context == null || context.weatherContext() == null || !context.allowWeather()) {
      return null;
    }
    if (!context.weatherContext().available()) {
      return "Погодный контекст недоступен, расчёт выполнен без него.";
    }
    return "Использован погодный контекст для локации " + context.weatherContext().locationDisplayName() + ".";
  }

  private String sensorContribution(RecommendationRequestContext context) {
    if (context == null || !(context.sensorContext() instanceof WateringSensorContextDto dto)) {
      return null;
    }
    return "Использованы данные датчиков: " + dto.source() + ".";
  }

  private String learningContribution(RecommendationRequestContext context) {
    return context == null || context.learningContext() == null
        ? null
        : "Использована история полива.";
  }

  private WateringRecommendation recommendQuickProfile(Plant plant, User user, boolean allowSensors) {
    if (allowSensors) {
      return legacyRuntimeRecommendationDelegate.recommendQuick(plant, user);
    }
    return legacyRuntimeRecommendationDelegate.recommendQuick(plant);
  }

  @Override
  public RecommendationResult scheduled(RecommendationRequestContext context) {
    WateringRecommendationPreviewRequest request = toPreviewRequest(context, resolveScheduledMode(context));
    WateringSensorContextDto sensorContext = context != null && context.sensorContext() instanceof WateringSensorContextDto dto
        ? dto
        : null;
    return recommendationResultMapper.fromPreviewResponse(
        wateringRecommendationEngine.recommendExistingPlantContext(toPreviewUser(context), request, sensorContext),
        context == null ? null : context.mode(),
        context != null && context.manualOverrideActive()
    );
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

  private WateringRecommendationPreviewRequest toPreviewRequest(RecommendationRequestContext context,
                                                               RecommendationMode modeOverride) {
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
        modeOverride == null ? toRecommendationMode(context == null ? null : context.mode()) : modeOverride
    );
  }

  private RecommendationMode resolveScheduledMode(RecommendationRequestContext context) {
    boolean allowAi = allowAi(context);
    boolean allowWeather = allowWeather(context);
    if (allowAi) {
      return RecommendationMode.HYBRID;
    }
    if (allowWeather) {
      return RecommendationMode.WEATHER_ADJUSTED;
    }
    return RecommendationMode.HEURISTIC;
  }

  private User toPreviewUser(RecommendationRequestContext context) {
    if (context == null || context.userId() == null) {
      return null;
    }
    User user = new User();
    user.setId(context.userId());
    LocationContext locationContext = context.locationContext();
    if (locationContext != null && locationContext.locationSource() != LocationSource.NONE) {
      user.setCity(firstNonBlank(locationContext.cityLabel(), locationContext.canonicalQuery(), locationContext.displayName()));
      user.setCityDisplayName(locationContext.displayName());
      user.setCityLat(locationContext.lat());
      user.setCityLon(locationContext.lon());
    }
    return user;
  }

  private User toRuntimeUser(RecommendationRequestContext context) {
    if (context == null || context.userId() == null) {
      return null;
    }
    User user = new User();
    user.setId(context.userId());
    LocationContext locationContext = context.locationContext();
    if (locationContext != null) {
      user.setCity(firstNonBlank(locationContext.cityLabel(), locationContext.canonicalQuery(), locationContext.displayName()));
      user.setCityDisplayName(locationContext.displayName());
      user.setCityLat(locationContext.lat());
      user.setCityLon(locationContext.lon());
    }
    return user;
  }

  private boolean allowAi(RecommendationRequestContext context) {
    return context != null && context.allowAI();
  }

  private boolean allowWeather(RecommendationRequestContext context) {
    return context != null && context.allowWeather();
  }

  private boolean allowSensors(RecommendationRequestContext context) {
    return context != null && context.allowSensors();
  }

  private boolean isSeedMode(RecommendationRequestContext context) {
    if (context == null) {
      return false;
    }
    return context.category() == PlantCategory.SEED_START
        || context.environmentType() == PlantEnvironmentType.SEED_START
        || context.seedStage() != null;
  }

  private Plant toRuntimePlant(RecommendationRequestContext context) {
    if (context == null) {
      throw new IllegalArgumentException("context is required");
    }
    Plant plant = new Plant();
    plant.setId(context.plantId());
    plant.setName(context.plantName());
    plant.setCategory(context.category() == null ? PlantCategory.HOME : context.category());
    plant.setWateringProfile(context.environmentType() == null ? PlantEnvironmentType.INDOOR : context.environmentType());
    plant.setPlacement(context.placement() == null ? PlantPlacement.INDOOR : context.placement());
    plant.setType(context.plantType() == null ? PlantType.DEFAULT : context.plantType());
    plant.setPotVolumeLiters(context.potVolumeLiters() == null ? 1.5 : context.potVolumeLiters());
    plant.setBaseIntervalDays(context.baseIntervalDays() == null ? 7 : context.baseIntervalDays());
    plant.setPreferredWaterMl(context.preferredWaterMl());
    plant.setManualWaterVolumeMl(context.manualWaterVolumeMl());
    plant.setManualOverrideActive(context.manualOverrideActive());
    plant.setRecommendedIntervalDays(context.recommendedIntervalDays());
    plant.setRecommendedWaterVolumeMl(context.recommendedWaterVolumeMl());
    plant.setRecommendationSource(context.recommendationSource());
    plant.setGeneratedAt(context.recommendationGeneratedAt());
    plant.setContainerType(context.containerType());
    plant.setContainerVolumeLiters(context.containerVolumeLiters());
    plant.setOutdoorAreaM2(context.outdoorAreaM2());
    plant.setOutdoorSoilType(context.outdoorSoilType());
    plant.setSunExposure(context.sunExposure());
    plant.setGreenhouse(context.greenhouse());
    plant.setMulched(context.mulched());
    plant.setPerennial(context.perennial());
    plant.setWinterDormancyEnabled(context.winterDormancyEnabled());
    plant.setDripIrrigation(context.dripIrrigation());
    plant.setGrowthStage(context.growthStage());
    plant.setCropType(context.cropType());
    if (context.locationContext() != null) {
      plant.setCity(context.locationContext().cityLabel());
      plant.setRegion(context.locationContext().regionLabel());
    }
    plant.setLastWateredDate(java.time.LocalDate.now());
    return plant;
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
