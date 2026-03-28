package com.example.plantbot.service;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.RuntimeRecommendationAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.util.WeatherData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Month;
import java.util.OptionalDouble;

@Service
@RequiredArgsConstructor
@Slf4j
public class WateringRecommendationService {
  private final LearningService learningService;
  private final OptionalSensorContextService optionalSensorContextService;
  private final PlantRecommendationContextMapper plantRecommendationContextMapper;
  private final RecommendationFacade recommendationFacade;
  private final RuntimeRecommendationAdapter runtimeRecommendationAdapter;
  private final LocationContextResolver locationContextResolver;
  private final WeatherContextResolver weatherContextResolver;

  public WateringRecommendation recommend(Plant plant, User user) {
    RecommendationRequestContext context = buildRuntimeContext(plant, user);
    return runtimeRecommendationAdapter.adapt(recommendationFacade.runtime(context));
  }

  // Fast local-only recommendation path for user actions where low latency matters.
  // Does not call external APIs (weather/OpenRouter).
  public WateringRecommendation recommendQuick(Plant plant) {
    RecommendationRequestContext context = buildQuickContext(plant, null);
    return runtimeRecommendationAdapter.adapt(recommendationFacade.runtime(context));
  }

  public WateringRecommendation recommendQuick(Plant plant, User user) {
    RecommendationRequestContext context = buildQuickContext(plant, user);
    return runtimeRecommendationAdapter.adapt(recommendationFacade.runtime(context));
  }

  public LearningInfo learningInfo(Plant plant, User user) {
    var locationContext = locationContextResolver.resolveForPlant(user, plant);
    var weather = weatherContextResolver.resolve(user, locationContext, com.example.plantbot.service.recommendation.model.RecommendationFlowType.RUNTIME);
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double weatherFactor = weatherFactor(weather);
    double plantFactor = plantFactor(plant);

    OptionalDouble avgActual = learningService.getAverageInterval(plant);
    OptionalDouble smoothed = learningService.getSmoothedInterval(plant);

    double learned = smoothed.isPresent() ? smoothed.getAsDouble() : base;
    double finalInterval = clamp(learned * seasonFactor * weatherFactor * plantFactor, 1.0, 60.0);

    return new LearningInfo(base,
        avgActual.isPresent() ? avgActual.getAsDouble() : null,
        smoothed.isPresent() ? smoothed.getAsDouble() : null,
        seasonFactor,
        weatherFactor,
        plantFactor,
        finalInterval);
  }

  RecommendationRequestContext buildRuntimeContext(Plant plant, User user) {
    var sensorContext = optionalSensorContextService.resolveForPlant(user, plant);
    return plantRecommendationContextMapper.mapForRefresh(plant, user, sensorContext);
  }

  RecommendationRequestContext buildQuickContext(Plant plant, User user) {
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double plantFactor = plantFactor(plant);
    OptionalDouble avgActual = learningService.getAverageInterval(plant);
    OptionalDouble smoothed = learningService.getSmoothedInterval(plant);
    double learned = smoothed.isPresent() ? smoothed.getAsDouble() : base;
    double finalInterval = clamp(learned * seasonFactor * plantFactor, 1.0, 60.0);
    LearningInfo info = new LearningInfo(
        base,
        avgActual.isPresent() ? avgActual.getAsDouble() : null,
        smoothed.isPresent() ? smoothed.getAsDouble() : null,
        seasonFactor,
        1.0,
        plantFactor,
        finalInterval
    );
    return plantRecommendationContextMapper.mapForQuick(plant, user, info, user != null);
  }

  private double seasonFactor(Month month) {
    return switch (month) {
      case JUNE, JULY, AUGUST -> 0.8;
      case DECEMBER, JANUARY, FEBRUARY -> 1.2;
      default -> 1.0;
    };
  }

  private double weatherFactor(com.example.plantbot.service.recommendation.model.WeatherContext weather) {
    if (weather == null || !weather.available()) {
      return 1.0;
    }
    double factor = 1.0;
    if (weather.temperatureNowC() != null && weather.temperatureNowC() >= 28) {
      factor *= 0.85;
    } else if (weather.temperatureNowC() != null && weather.temperatureNowC() <= 10) {
      factor *= 1.15;
    }
    if (weather.humidityNowPercent() != null && weather.humidityNowPercent() <= 40) {
      factor *= 0.9;
    } else if (weather.humidityNowPercent() != null && weather.humidityNowPercent() >= 70) {
      factor *= 1.1;
    }
    return factor;
  }

  private double plantFactor(Plant plant) {
    if (isOutdoor(plant)) {
      return outdoorFactor(plant) * outdoorCategoryIntervalFactor(plant);
    }
    return potFactor(plant.getPotVolumeLiters());
  }

  private double potFactor(double liters) {
    if (liters < 1.5) {
      return 0.9;
    }
    if (liters > 3.0) {
      return 1.1;
    }
    return 1.0;
  }

  private double outdoorFactor(Plant plant) {
    double factor = 1.0;

    Double area = plant.getOutdoorAreaM2();
    if (area != null) {
      if (area < 2.0) {
        factor *= 0.9;
      } else if (area > 10.0) {
        factor *= 1.1;
      }
    }

    OutdoorSoilType soil = plant.getOutdoorSoilType();
    if (soil != null) {
      factor *= switch (soil) {
        case SANDY -> 0.85;
        case LOAMY -> 1.0;
        case CLAY -> 1.15;
      };
    }

    SunExposure sun = plant.getSunExposure();
    if (sun != null) {
      factor *= switch (sun) {
        case FULL_SUN -> 0.85;
        case PARTIAL_SHADE -> 1.0;
        case SHADE -> 1.12;
      };
    }

    if (Boolean.TRUE.equals(plant.getMulched())) {
      factor *= 1.1;
    }

    return factor;
  }

  private boolean isWinterDormancyActive(Plant plant) {
    if (!isOutdoor(plant)) {
      return false;
    }
    if (!Boolean.TRUE.equals(plant.getPerennial()) || !Boolean.TRUE.equals(plant.getWinterDormancyEnabled())) {
      return false;
    }
    Month month = LocalDate.now().getMonth();
    return month == Month.DECEMBER || month == Month.JANUARY || month == Month.FEBRUARY;
  }

  private double recommendWaterLiters(Plant plant, WeatherData weather) {
    // Если пользователь вручную зафиксировал объём в wizard — используем его как приоритет.
    if (plant.getPreferredWaterMl() != null && plant.getPreferredWaterMl() > 0) {
      return roundTwoDecimals(clamp(plant.getPreferredWaterMl() / 1000.0, 0.05, 25.0));
    }

    if (isOutdoor(plant) && plant.getOutdoorAreaM2() != null && plant.getOutdoorAreaM2() > 0) {
      double litersPerM2 = outdoorLitersPerM2(plant);
      double weatherBoost = 1.0;
      if (weather != null) {
        if (weather.temperatureC() >= 28) {
          weatherBoost *= 1.15;
        } else if (weather.temperatureC() <= 10) {
          weatherBoost *= 0.9;
        }
        if (weather.humidityPercent() <= 40) {
          weatherBoost *= 1.1;
        } else if (weather.humidityPercent() >= 70) {
          weatherBoost *= 0.9;
        }
      }
      return roundTwoDecimals(Math.max(0.5, plant.getOutdoorAreaM2() * litersPerM2 * weatherBoost));
    }

    double min = plant.getType().getMinWaterPercent();
    double max = plant.getType().getMaxWaterPercent();
    double percent = (min + max) / 2.0;
    return roundTwoDecimals(plant.getPotVolumeLiters() * percent);
  }

  private boolean isOutdoor(Plant plant) {
    PlantPlacement placement = plant.getPlacement();
    return placement == PlantPlacement.OUTDOOR;
  }

  private double clamp(double value, double min, double max) {
    return Math.max(min, Math.min(max, value));
  }

  private double roundTwoDecimals(double value) {
    return Math.round(value * 100.0) / 100.0;
  }

  private double safeNonZeroLiters(double liters, Plant plant) {
    if (liters > 0) {
      return roundTwoDecimals(liters);
    }
    if (isOutdoor(plant)) {
      double area = plant.getOutdoorAreaM2() == null || plant.getOutdoorAreaM2() <= 0 ? 1.0 : plant.getOutdoorAreaM2();
      double derived = Math.max(0.5, area * outdoorLitersPerM2(plant) * 0.35);
      double fallback = roundTwoDecimals(clamp(derived, 0.5, 25.0));
      log.warn("Watering liters was <= 0, using outdoor fallback {} (area={}, type={})",
          fallback, plant.getOutdoorAreaM2(), plant.getType());
      return fallback;
    }

    double pot = plant.getPotVolumeLiters() > 0 ? plant.getPotVolumeLiters() : 1.5;
    double percent = (plant.getType().getMinWaterPercent() + plant.getType().getMaxWaterPercent()) / 2.0;
    double derived = pot * percent;
    double fallback = roundTwoDecimals(clamp(Math.max(0.12, derived), 0.12, 3.0));
    log.warn("Watering liters was <= 0, using indoor fallback {} (pot={}, type={})",
        fallback, plant.getPotVolumeLiters(), plant.getType());
    return fallback;
  }

  private double outdoorLitersPerM2(Plant plant) {
    double base = switch (plant.getType()) {
      case SUCCULENT -> 2.0;
      case TROPICAL -> 6.0;
      case FERN -> 5.0;
      case CONIFER -> 3.5;
      default -> 4.0;
    };
    return roundTwoDecimals(base * outdoorCategoryVolumeFactor(plant));
  }

  private double outdoorCategoryIntervalFactor(Plant plant) {
    PlantCategory category = plant.getCategory();
    if (category == PlantCategory.OUTDOOR_GARDEN) {
      return 0.88; // садовые поливаем чаще
    }
    if (category == PlantCategory.OUTDOOR_DECORATIVE) {
      return 1.0;
    }
    return 1.0;
  }

  private double outdoorCategoryVolumeFactor(Plant plant) {
    PlantCategory category = plant.getCategory();
    if (category == PlantCategory.OUTDOOR_GARDEN) {
      return 1.25; // садовым обычно нужен больший объём
    }
    if (category == PlantCategory.OUTDOOR_DECORATIVE) {
      return 1.0;
    }
    return 1.0;
  }

  private double enforceMinimumReasonableWater(Plant plant, double liters) {
    if (liters <= 0) {
      return liters;
    }
    // Если объём задан пользователем вручную в wizard, не повышаем его эвристиками.
    if (plant.getPreferredWaterMl() != null && plant.getPreferredWaterMl() > 0) {
      return roundTwoDecimals(clamp(plant.getPreferredWaterMl() / 1000.0, 0.05, 25.0));
    }
    double minReasonable;
    if (isOutdoor(plant)) {
      double area = plant.getOutdoorAreaM2() == null || plant.getOutdoorAreaM2() <= 0 ? 1.0 : plant.getOutdoorAreaM2();
      minReasonable = Math.max(0.5, area * outdoorLitersPerM2(plant) * 0.35);
    } else {
      double pot = plant.getPotVolumeLiters() > 0 ? plant.getPotVolumeLiters() : 1.5;
      minReasonable = Math.max(0.12, pot * plant.getType().getMinWaterPercent() * 0.85);
    }
    double adjusted = Math.max(liters, minReasonable);
    if (adjusted > liters) {
      log.info("Raised low water recommendation from {} to {} for plantId={} name='{}'",
          roundTwoDecimals(liters), roundTwoDecimals(adjusted), plant.getId(), plant.getName());
    }
    return roundTwoDecimals(adjusted);
  }

  private double clampIntervalByConfidence(double baseInterval, double interval, boolean hasHistory) {
    double minFactor = hasHistory ? 0.5 : 0.7;
    double maxFactor = hasHistory ? 2.0 : 1.5;
    double min = Math.max(1.0, baseInterval * minFactor);
    double max = Math.max(3.0, baseInterval * maxFactor);
    double clamped = clamp(interval, min, max);
    if (clamped != interval) {
      log.info("Interval clamped from {} to {} (base={}, hasHistory={})",
          roundTwoDecimals(interval), roundTwoDecimals(clamped), baseInterval, hasHistory);
    }
    return clamped;
  }
}
