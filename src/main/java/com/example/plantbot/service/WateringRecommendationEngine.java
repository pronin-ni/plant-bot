package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringCyclePreviewDto;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WateringMode;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WateringRecommendationEngine {
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  private final OutdoorWeatherContextService outdoorWeatherContextService;
  private final OptionalSensorContextService optionalSensorContextService;

  public WateringRecommendationResponse recommendPreview(User user, WateringRecommendationPreviewRequest request) {
    WateringSensorContextDto sensorContext = optionalSensorContextService.resolveForPreview(user, request);
    return recommendInternal(user, request, sensorContext);
  }

  public WateringRecommendationResponse recommendForExistingPlant(User user, Plant plant) {
    WateringRecommendationPreviewRequest request = new WateringRecommendationPreviewRequest(
        plant.getName(),
        plant.getWateringProfileType(),
        plant.getPlantPlacementType(),
        plant.getManualWaterVolumeMl(),
        plant.getWeatherAdjustmentEnabled(),
        plant.getAiWateringEnabled(),
        plant.getRegion(),
        plant.getWateringProfile() == null ? PlantEnvironmentType.INDOOR : plant.getWateringProfile(),
        plant.getPotVolumeLiters(),
        plant.getBaseIntervalDays(),
        plant.getContainerType(),
        plant.getContainerVolumeLiters(),
        plant.getSunExposure() == null ? null : plant.getSunExposure().name(),
        plant.getOutdoorSoilType() == null ? null : plant.getOutdoorSoilType().name(),
        plant.getCropType(),
        plant.getGrowthStage() == null ? null : plant.getGrowthStage().name(),
        plant.getGrowthStageV2(),
        plant.getGreenhouse(),
        plant.getSoilType(),
        plant.getSunlightExposure(),
        null,
        null,
        null,
        null,
        null,
        null,
        plant.getCity() == null ? plant.getRegion() : plant.getCity(),
        RecommendationMode.HYBRID
    );
    WateringSensorContextDto sensorContext = optionalSensorContextService.resolveForPlant(user, plant);
    return recommendInternal(user, request, sensorContext);
  }

  private WateringRecommendationResponse recommendInternal(User user,
                                                           WateringRecommendationPreviewRequest request,
                                                           WateringSensorContextDto sensorContext) {
    PlantEnvironmentType env = resolveEnvironmentType(request);
    RecommendationMode mode = request.mode() == null ? RecommendationMode.HYBRID : request.mode();

    NormalizedWeatherContext weatherContext = outdoorWeatherContextService.resolve(user, request.city(), request.region());

    Recommendation baseProfile = buildBaseProfile(env, request);
    WeatherAdjustedValues weatherAdjustedValues = applyOutdoorWeatherAdjustments(baseProfile, env, weatherContext);
    Recommendation weatherAdjusted = weatherAdjustedValues.recommendation();

    // Optional HA enhancement only (non-blocking and never mandatory).
    Recommendation withOptionalSensors = applyOptionalSensorAdjustments(weatherAdjusted, sensorContext);

    if (mode == RecommendationMode.BASE_PROFILE) {
      return asResponse(baseProfile, env, RecommendationSource.BASE_PROFILE, 0.55, sensorContext, weatherContext);
    }

    if (mode == RecommendationMode.MANUAL) {
      Recommendation manual = buildManualRecommendation(request, baseProfile);
      return asResponse(manual, env, RecommendationSource.MANUAL, 0.95, sensorContext, weatherContext);
    }

    if (mode == RecommendationMode.WEATHER_ADJUSTED) {
      RecommendationSource source = weatherAdjustedValues.changed() && env != PlantEnvironmentType.INDOOR
          ? RecommendationSource.WEATHER_ADJUSTED
          : RecommendationSource.BASE_PROFILE;
      double confidence = weatherAdjustedValues.changed() ? 0.68 : 0.58;
      confidence = adjustConfidenceForWeather(confidence, env, weatherContext);
      return asResponse(withOptionalSensors, env, source, confidence, sensorContext, weatherContext);
    }

    if (mode == RecommendationMode.HEURISTIC) {
      return asResponse(withOptionalSensors, env, RecommendationSource.HEURISTIC, adjustConfidenceForWeather(0.62, env, weatherContext), sensorContext, weatherContext);
    }

    if (mode == RecommendationMode.FALLBACK) {
      Recommendation forcedFallback = withOptionalSensors.withSummary("Принудительный fallback-режим: использована базовая модель.");
      return asResponse(forcedFallback, env, RecommendationSource.FALLBACK, 0.45, sensorContext, weatherContext);
    }

    Optional<Recommendation> aiRecommendation = buildAi(user, env, request, weatherContext, sensorContext);
    if (mode == RecommendationMode.AI) {
      if (aiRecommendation.isPresent()) {
        return asResponse(aiRecommendation.get(), env, RecommendationSource.AI, adjustConfidenceForWeather(0.84, env, weatherContext), sensorContext, weatherContext);
      }
      Recommendation fallback = withOptionalSensors
          .withSummary("AI недоступен, использован fallback-расчёт.")
          .withExtraWarning("AI не вернул валидный ответ, включен fallback.");
      return asResponse(fallback, env, RecommendationSource.FALLBACK, 0.45, sensorContext, weatherContext);
    }

    // HYBRID (default): AI + базовая модель (weather/season aware), либо fallback.
    if (aiRecommendation.isPresent()) {
      Recommendation hybrid = blend(aiRecommendation.get(), withOptionalSensors, env);
      return asResponse(hybrid, env, RecommendationSource.HYBRID, adjustConfidenceForWeather(0.78, env, weatherContext), sensorContext, weatherContext);
    }

    Recommendation fallback = withOptionalSensors
        .withSummary("AI недоступен, использован fallback-расчёт.")
        .withExtraWarning("AI не вернул валидный ответ, включен fallback.");
    return asResponse(fallback, env, RecommendationSource.FALLBACK, 0.45, sensorContext, weatherContext);
  }

  private Recommendation buildBaseProfile(PlantEnvironmentType env, WateringRecommendationPreviewRequest request) {
    int interval = switch (env) {
      case INDOOR -> clamp(defaultInt(request.baseIntervalDays(), 7), 2, 21);
      case OUTDOOR_ORNAMENTAL -> clamp(defaultInt(request.baseIntervalDays(), 3), 1, 21);
      case OUTDOOR_GARDEN -> clamp(defaultInt(request.baseIntervalDays(), request.greenhouse() != null && request.greenhouse() ? 3 : 2), 1, 21);
    };

    int waterMl = switch (env) {
      case INDOOR -> clamp((int) Math.round(Math.max(0.3, defaultDouble(request.potVolumeLiters(), 2.0)) * 130.0), 120, 2200);
      case OUTDOOR_ORNAMENTAL -> clamp((int) Math.round(Math.max(0.5, defaultDouble(request.containerVolume(), 4.0)) * 170.0), 180, 3200);
      case OUTDOOR_GARDEN -> request.greenhouse() != null && request.greenhouse() ? 450 : 600;
    };

    SeasonalAdjustment seasonal = applySeasonAdjustment(interval, waterMl, env);

    List<String> reasoning = new ArrayList<>();
    reasoning.add("Профиль: " + env.name());
    if (request.baseIntervalDays() != null) {
      reasoning.add("Базовый интервал: " + request.baseIntervalDays() + " дн.");
    }
    reasoning.addAll(seasonal.reasoning());

    String summary = switch (env) {
      case INDOOR -> "Базовый indoor-профиль рассчитан по объему горшка, типу размещения и сезонности.";
      case OUTDOOR_ORNAMENTAL -> "Базовый outdoor ornamental-профиль рассчитан по контейнеру и сезонности.";
      case OUTDOOR_GARDEN -> "Базовый garden-профиль рассчитан по культуре, стадии и сезонности.";
    };

    return new Recommendation(
        seasonal.intervalDays(),
        seasonal.waterMl(),
        summary,
        reasoning,
        new ArrayList<>(List.of("Базовая модель: для точности попробуйте HYBRID/AI.")),
        resolveMode(seasonal.intervalDays(), seasonal.waterMl())
    );
  }

  private SeasonalAdjustment applySeasonAdjustment(int intervalDays, int waterMl, PlantEnvironmentType env) {
    int month = LocalDate.now().getMonthValue();
    int interval = intervalDays;
    int volume = waterMl;
    List<String> reasoning = new ArrayList<>();

    if (env == PlantEnvironmentType.INDOOR) {
      if (month == 12 || month <= 2) {
        interval = clamp(interval + 1, 1, 30);
        volume = clamp((int) Math.round(volume * 0.92), 80, 10_000);
        reasoning.add("Сезонность indoor: зимой полив реже.");
      } else if (month >= 6 && month <= 8) {
        interval = clamp(interval - 1, 1, 30);
        volume = clamp((int) Math.round(volume * 1.08), 80, 10_000);
        reasoning.add("Сезонность indoor: летом полив чаще.");
      }
    } else {
      if (month == 12 || month <= 2) {
        interval = clamp(interval + 2, 1, 30);
        volume = clamp((int) Math.round(volume * 0.85), 80, 10_000);
        reasoning.add("Сезонность outdoor: холодный сезон удлиняет интервал.");
      } else if (month >= 6 && month <= 8) {
        interval = clamp(interval - 1, 1, 30);
        volume = clamp((int) Math.round(volume * 1.12), 80, 10_000);
        reasoning.add("Сезонность outdoor: теплый сезон сокращает интервал.");
      }
    }

    return new SeasonalAdjustment(interval, volume, reasoning);
  }

  private WeatherAdjustedValues applyOutdoorWeatherAdjustments(Recommendation base,
                                                               PlantEnvironmentType env,
                                                               NormalizedWeatherContext weatherContext) {
    if (env == PlantEnvironmentType.INDOOR) {
      return new WeatherAdjustedValues(base, false);
    }

    int interval = base.intervalDays();
    int waterMl = base.waterMl();
    List<String> reasoning = new ArrayList<>(base.reasoning());
    List<String> warnings = new ArrayList<>(base.warnings());
    boolean changed = false;

    if (!weatherContext.available()) {
      reasoning.add("Weather adjustment: погода недоступна, использована только базовая модель.");
      warnings.addAll(weatherContext.warnings());
      return new WeatherAdjustedValues(
          new Recommendation(interval, waterMl, base.summary(), reasoning, warnings, base.wateringMode()),
          false
      );
    }

    Double rain24h = weatherContext.precipitationLast24hMm();
    Double forecastRain = weatherContext.precipitationForecastNext72hMm();
    Double tempNow = weatherContext.temperatureNowC();
    Double tempMax3d = weatherContext.maxTemperatureNext3DaysC();
    Double humidity = weatherContext.humidityNowPercent();

    if ((rain24h != null && rain24h >= 6.0) || (forecastRain != null && forecastRain >= 8.0)) {
      interval = clamp(interval + 2, 1, 30);
      waterMl = clamp((int) Math.round(waterMl * 0.82), 100, 8000);
      if (rain24h != null && rain24h >= 6.0) {
        reasoning.add(String.format("За последние 24 часа выпало %.1f мм осадков — полив можно отложить.", rain24h));
      } else {
        reasoning.add(String.format("В ближайшие дни ожидается около %.1f мм осадков — полив без спешки.", forecastRain));
      }
      changed = true;
    }

    if ((tempNow != null && tempNow >= 30.0) || (tempMax3d != null && tempMax3d >= 32.0)) {
      interval = clamp(interval - 1, 1, 30);
      waterMl = clamp((int) Math.round(waterMl * 1.15), 100, 8000);
      if (tempMax3d != null && tempMax3d >= 32.0) {
        reasoning.add(String.format("Ожидается жара до %.0f°C — интервал сокращён, объём увеличен.", tempMax3d));
      } else {
        reasoning.add(String.format("Сейчас жарко (%.0f°C) — интервал сокращён, объём увеличен.", tempNow));
      }
      changed = true;
    }

    if (tempNow != null && tempNow <= 12.0 && humidity != null && humidity >= 75.0) {
      interval = clamp(interval + 1, 1, 30);
      waterMl = clamp((int) Math.round(waterMl * 0.90), 100, 8000);
      reasoning.add("Сейчас прохладно и влажно — полив можно немного отложить.");
      changed = true;
    }

    if (!changed && rain24h != null && rain24h <= 1.0 && (forecastRain == null || forecastRain <= 2.0)) {
      reasoning.add(String.format("Дождя почти не было: %.1f мм за 24 часа, поэтому сохраняем более сухой outdoor-режим.", rain24h));
    }

    if (weatherContext.fallbackUsed()) {
      warnings.add(weatherContext.staleFallbackUsed()
          ? "Погодный контекст взят из сохранённого кэша, рекомендации могут быть менее точными."
          : "Использован резервный погодный источник.");
    }
    if (weatherContext.degraded()) {
      warnings.add("Погодный контекст частично недоступен, рекомендация использует degraded outdoor mode.");
    }

    warnings.addAll(weatherContext.warnings());

    Recommendation adjusted = new Recommendation(
        interval,
        waterMl,
        changed ? "Рекомендация скорректирована погодным контекстом." : base.summary(),
        reasoning,
        warnings,
        resolveMode(interval, waterMl)
    );
    return new WeatherAdjustedValues(adjusted, changed);
  }

  private Recommendation applyOptionalSensorAdjustments(Recommendation recommendation, WateringSensorContextDto sensorContext) {
    if (sensorContext == null || !sensorContext.available()) {
      return recommendation;
    }

    int interval = recommendation.intervalDays();
    int waterMl = recommendation.waterMl();
    List<String> reasoning = new ArrayList<>(recommendation.reasoning());
    List<String> warnings = new ArrayList<>(recommendation.warnings());

    if (sensorContext.soilMoisturePercent() != null) {
      if (sensorContext.soilMoisturePercent() < 30.0) {
        interval = clamp(interval - 1, 1, 30);
        waterMl = clamp((int) Math.round(waterMl * 1.10), 100, 8000);
        reasoning.add("Доп. коррекция сенсорами: низкая влажность почвы.");
      } else if (sensorContext.soilMoisturePercent() > 70.0) {
        interval = clamp(interval + 1, 1, 30);
        waterMl = clamp((int) Math.round(waterMl * 0.88), 100, 8000);
        reasoning.add("Доп. коррекция сенсорами: высокая влажность почвы.");
      }
    }

    if (sensorContext.temperatureC() != null && sensorContext.temperatureC() > 30.0) {
      interval = clamp(interval - 1, 1, 30);
      reasoning.add("Доп. коррекция сенсорами: высокая температура.");
    }

    if (sensorContext.humidityPercent() != null && sensorContext.humidityPercent() < 35.0) {
      waterMl = clamp((int) Math.round(waterMl * 1.08), 100, 8000);
      reasoning.add("Доп. коррекция сенсорами: низкая влажность воздуха.");
    }

    if (sensorContext.confidence() == SensorConfidence.LOW) {
      warnings.add("HA-контекст собран по ограниченному набору сенсоров.");
    }

    return new Recommendation(
        interval,
        waterMl,
        recommendation.summary(),
        reasoning,
        warnings,
        resolveMode(interval, waterMl)
    );
  }

  private Recommendation buildManualRecommendation(WateringRecommendationPreviewRequest request, Recommendation fallbackBase) {
    int interval = clamp(defaultInt(request.baseIntervalDays(), fallbackBase.intervalDays()), 1, 30);
    int water = clamp(defaultInt(request.manualWaterVolumeMl(), fallbackBase.waterMl()), 50, 10_000);
    return new Recommendation(
        interval,
        water,
        "Рекомендация применена вручную.",
        List.of("Пользовательский manual override."),
        List.of("Автоматические источники не применялись."),
        resolveMode(interval, water)
    );
  }

  private Optional<Recommendation> buildAi(User user,
                                           PlantEnvironmentType env,
                                           WateringRecommendationPreviewRequest request,
                                           NormalizedWeatherContext weatherContext,
                                           WateringSensorContextDto sensorContext) {
    String weatherSummary = enrichWeatherSummaryWithSensorContext(
        outdoorWeatherContextService.toPromptSummary(weatherContext),
        sensorContext
    );
    var aiResult = openRouterPlantAdvisorService.suggestWizardRecommendation(
        user,
        new OpenRouterPlantAdvisorService.WizardRecommendInput(
            resolvePlantName(request),
            env,
            categoryByEnvironment(env),
            PlantType.DEFAULT,
            defaultInt(request.baseIntervalDays(), env == PlantEnvironmentType.INDOOR ? 7 : 3),
            request.potVolumeLiters(),
            null,
            null,
            request.containerType() == null ? null : request.containerType().name(),
            request.growthStage(),
            request.greenhouse(),
            resolveSoilType(request),
            resolveSunExposure(request),
            weatherContext.city(),
            weatherSummary,
            null,
            null
        )
    );

    if (aiResult.isEmpty()) {
      return Optional.empty();
    }

    int interval = aiResult.get().recommendedIntervalDays();
    int waterMl = aiResult.get().recommendedWaterMl();
    if (!isValidByProfile(env, interval, waterMl)) {
      return Optional.empty();
    }

    return Optional.of(new Recommendation(
        interval,
        waterMl,
        aiResult.get().summary(),
        nonEmptyOrDefault(aiResult.get().reasoning(), List.of("AI анализ контекста выращивания.")),
        nonEmptyOrDefault(aiResult.get().warnings(), List.of()),
        resolveMode(interval, waterMl)
    ));
  }

  private Recommendation blend(Recommendation ai, Recommendation heuristic, PlantEnvironmentType env) {
    int interval = clamp((int) Math.round(ai.intervalDays() * 0.75 + heuristic.intervalDays() * 0.25), 1, 30);
    int waterMl = clamp((int) Math.round(ai.waterMl() * 0.75 + heuristic.waterMl() * 0.25), minWaterByProfile(env), maxWaterByProfile(env));
    List<String> reasoning = new ArrayList<>();
    reasoning.add("HYBRID: AI результат скорректирован базовой моделью и погодой.");
    reasoning.addAll(ai.reasoning());
    return new Recommendation(
        interval,
        waterMl,
        "Гибридная рекомендация: AI + базовая модель.",
        reasoning,
        ai.warnings(),
        resolveMode(interval, waterMl)
    );
  }

  private WateringRecommendationResponse asResponse(Recommendation recommendation,
                                                    PlantEnvironmentType env,
                                                    RecommendationSource source,
                                                    double confidence,
                                                    WateringSensorContextDto sensorContext,
                                                    NormalizedWeatherContext weatherContext) {
    return new WateringRecommendationResponse(
        source,
        env,
        recommendation.waterMl(),
        recommendation.intervalDays(),
        recommendation.waterMl(),
        recommendation.wateringMode(),
        confidence,
        recommendation.summary(),
        recommendation.reasoning(),
        recommendation.warnings(),
        env != PlantEnvironmentType.INDOOR && weatherContext.available(),
        buildWeatherContextPreview(weatherContext),
        buildCyclePreview(recommendation.intervalDays()),
        sensorContext
    );
  }

  private PlantEnvironmentType resolveEnvironmentType(WateringRecommendationPreviewRequest request) {
    if (request.environmentType() != null) {
      return request.environmentType();
    }
    if (request.wateringProfileType() == null) {
      return PlantEnvironmentType.INDOOR;
    }
    return switch (request.wateringProfileType()) {
      case INDOOR -> PlantEnvironmentType.INDOOR;
      case OUTDOOR_ORNAMENTAL -> PlantEnvironmentType.OUTDOOR_ORNAMENTAL;
      case OUTDOOR_GARDEN -> PlantEnvironmentType.OUTDOOR_GARDEN;
    };
  }

  private WeatherContextPreviewResponse buildWeatherContextPreview(NormalizedWeatherContext weatherContext) {
    if (!weatherContext.available()) {
      return new WeatherContextPreviewResponse(
          false,
          weatherContext.degraded(),
          weatherContext.fallbackUsed(),
          weatherContext.staleFallbackUsed(),
          weatherContext.providerUsed() == null ? null : weatherContext.providerUsed().name(),
          weatherContext.city(),
          weatherContext.region(),
          null,
          null,
          weatherContext.precipitationLast24hMm(),
          weatherContext.precipitationForecastNext72hMm(),
          weatherContext.maxTemperatureNext3DaysC(),
          weatherContext.windNowMs(),
          weatherContext.confidence().name(),
          weatherContext.warnings()
      );
    }
    return new WeatherContextPreviewResponse(
        true,
        weatherContext.degraded(),
        weatherContext.fallbackUsed(),
        weatherContext.staleFallbackUsed(),
        weatherContext.providerUsed() == null ? null : weatherContext.providerUsed().name(),
        weatherContext.city(),
        weatherContext.region(),
        weatherContext.temperatureNowC(),
        weatherContext.humidityNowPercent(),
        weatherContext.precipitationLast24hMm(),
        weatherContext.precipitationForecastNext72hMm(),
        weatherContext.maxTemperatureNext3DaysC(),
        weatherContext.windNowMs(),
        weatherContext.confidence().name(),
        weatherContext.warnings()
    );
  }

  private double adjustConfidenceForWeather(double baseConfidence,
                                            PlantEnvironmentType env,
                                            NormalizedWeatherContext weatherContext) {
    if (env == PlantEnvironmentType.INDOOR) {
      return baseConfidence;
    }
    double adjusted = baseConfidence;
    if (!weatherContext.available()) {
      adjusted -= 0.12;
    }
    if (weatherContext.fallbackUsed()) {
      adjusted -= weatherContext.staleFallbackUsed() ? 0.12 : 0.06;
    }
    if (weatherContext.degraded()) {
      adjusted -= 0.08;
    }
    return Math.max(0.25, Math.min(0.95, adjusted));
  }

  private boolean isValidByProfile(PlantEnvironmentType env, int interval, int waterMl) {
    if (interval < 1 || interval > 30) {
      return false;
    }
    return waterMl >= minWaterByProfile(env) && waterMl <= maxWaterByProfile(env);
  }

  private int minWaterByProfile(PlantEnvironmentType env) {
    return switch (env) {
      case INDOOR -> 80;
      case OUTDOOR_ORNAMENTAL -> 120;
      case OUTDOOR_GARDEN -> 150;
    };
  }

  private int maxWaterByProfile(PlantEnvironmentType env) {
    return switch (env) {
      case INDOOR -> 2500;
      case OUTDOOR_ORNAMENTAL -> 5000;
      case OUTDOOR_GARDEN -> 8000;
    };
  }

  private WateringMode resolveMode(int interval, int waterMl) {
    if (interval >= 14) {
      return WateringMode.SOIL_CHECK_FIRST;
    }
    if (waterMl <= 200) {
      return WateringMode.LIGHT;
    }
    if (interval <= 2 && waterMl >= 500) {
      return WateringMode.DEEP;
    }
    return WateringMode.STANDARD;
  }

  private String resolvePlantName(WateringRecommendationPreviewRequest request) {
    if (resolveEnvironmentType(request) == PlantEnvironmentType.OUTDOOR_GARDEN
        && request.cropType() != null
        && !request.cropType().isBlank()) {
      return request.cropType().trim();
    }
    return request.plantName().trim();
  }

  private String resolveSoilType(WateringRecommendationPreviewRequest request) {
    if (request.soilType() != null && !request.soilType().isBlank()) {
      return request.soilType();
    }
    return request.soilTypeV2() == null ? null : request.soilTypeV2().name();
  }

  private String resolveSunExposure(WateringRecommendationPreviewRequest request) {
    if (request.sunExposure() != null && !request.sunExposure().isBlank()) {
      return request.sunExposure();
    }
    return request.sunlightExposure() == null ? null : request.sunlightExposure().name();
  }

  private PlantCategory categoryByEnvironment(PlantEnvironmentType environmentType) {
    if (environmentType == null) {
      return PlantCategory.HOME;
    }
    return switch (environmentType) {
      case OUTDOOR_ORNAMENTAL -> PlantCategory.OUTDOOR_DECORATIVE;
      case OUTDOOR_GARDEN -> PlantCategory.OUTDOOR_GARDEN;
      case INDOOR -> PlantCategory.HOME;
    };
  }

  private int defaultInt(Integer value, int defaultValue) {
    return value == null ? defaultValue : value;
  }

  private double defaultDouble(Double value, double defaultValue) {
    return value == null ? defaultValue : value;
  }

  private int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private List<String> nonEmptyOrDefault(List<String> items, List<String> fallback) {
    if (items == null || items.isEmpty()) {
      return fallback;
    }
    return items;
  }

  private String enrichWeatherSummaryWithSensorContext(String weatherSummary, WateringSensorContextDto sensorContext) {
    String safeWeather = weatherSummary == null || weatherSummary.isBlank()
        ? "нет погодных данных"
        : weatherSummary;
    if (sensorContext == null || !sensorContext.available()) {
      return safeWeather;
    }
    List<String> parts = new ArrayList<>();
    if (sensorContext.roomName() != null && !sensorContext.roomName().isBlank()) {
      parts.add("комната " + sensorContext.roomName());
    }
    if (sensorContext.temperatureC() != null) {
      parts.add(String.format(java.util.Locale.ROOT, "HA t=%.1f°C", sensorContext.temperatureC()));
    }
    if (sensorContext.humidityPercent() != null) {
      parts.add(String.format(java.util.Locale.ROOT, "HA humidity=%.0f%%", sensorContext.humidityPercent()));
    }
    if (sensorContext.soilMoisturePercent() != null) {
      parts.add(String.format(java.util.Locale.ROOT, "HA soil=%.0f%%", sensorContext.soilMoisturePercent()));
    }
    if (sensorContext.illuminanceLux() != null) {
      parts.add(String.format(java.util.Locale.ROOT, "HA lux=%.0f", sensorContext.illuminanceLux()));
    }
    if (sensorContext.confidence() != null) {
      parts.add("HA confidence=" + sensorContext.confidence().name());
    }
    if (parts.isEmpty()) {
      return safeWeather;
    }
    return safeWeather + "; " + String.join(", ", parts);
  }

  private WateringCyclePreviewDto buildCyclePreview(int intervalDays) {
    int safeInterval = clamp(intervalDays, 1, 30);
    LocalDate start = LocalDate.now();
    List<LocalDate> dates = new ArrayList<>();
    for (int i = 1; i <= 6; i++) {
      dates.add(start.plusDays((long) safeInterval * i));
    }
    return new WateringCyclePreviewDto(dates);
  }

  private record Recommendation(
      int intervalDays,
      int waterMl,
      String summary,
      List<String> reasoning,
      List<String> warnings,
      WateringMode wateringMode
  ) {
    private Recommendation withSummary(String newSummary) {
      return new Recommendation(intervalDays, waterMl, newSummary, reasoning, warnings, wateringMode);
    }

    private Recommendation withExtraWarning(String warning) {
      List<String> nextWarnings = new ArrayList<>(warnings);
      nextWarnings.add(warning);
      return new Recommendation(intervalDays, waterMl, summary, reasoning, nextWarnings, wateringMode);
    }
  }

  private record WeatherAdjustedValues(
      Recommendation recommendation,
      boolean changed
  ) {
  }

  private record SeasonalAdjustment(
      int intervalDays,
      int waterMl,
      List<String> reasoning
  ) {
  }
}
