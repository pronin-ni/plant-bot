package com.example.plantbot.service.recommendation.runtime;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.LearningService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.service.ha.HomeAssistantIntegrationService;
import com.example.plantbot.service.ha.IntervalAdjustmentResult;
import com.example.plantbot.util.AIWateringProfile;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.util.WeatherData;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Month;
import java.util.Optional;
import java.util.OptionalDouble;

@Service
public class LegacyRuntimeRecommendationDelegate {
  private final WeatherService weatherService;
  private final LearningService learningService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  private final HomeAssistantIntegrationService haIntegrationService;

  public LegacyRuntimeRecommendationDelegate(
      WeatherService weatherService,
      LearningService learningService,
      OpenRouterPlantAdvisorService openRouterPlantAdvisorService,
      HomeAssistantIntegrationService haIntegrationService
  ) {
    this.weatherService = weatherService;
    this.learningService = learningService;
    this.openRouterPlantAdvisorService = openRouterPlantAdvisorService;
    this.haIntegrationService = haIntegrationService;
  }

  public WateringRecommendation recommend(Plant plant, User user) {
    return recommendProfile(plant, user, true, true, true);
  }

  public WateringRecommendation recommendProfile(Plant plant,
                                                 User user,
                                                 boolean allowWeather,
                                                 boolean allowAi,
                                                 boolean allowSensors) {
    String location = resolvePlantWeatherLocation(plant, user);
    Optional<WeatherData> weather = allowWeather
        ? weatherService.getCurrent(location, user == null ? null : user.getCityLat(), user == null ? null : user.getCityLon())
        : Optional.empty();
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double weatherFactor = weather.map(this::weatherFactor).orElse(1.0);
    double plantFactor = plantFactor(plant);

    OptionalDouble smoothedOpt = learningService.getSmoothedInterval(plant);
    double learned = smoothedOpt.isPresent() ? smoothedOpt.getAsDouble() : base;

    double interval = learned * seasonFactor * weatherFactor * plantFactor;
    interval = clamp(interval, 1.0, 60.0);

    if (isOutdoor(plant) && isWinterDormancyActive(plant)) {
      return new WateringRecommendation(90.0, 0.0);
    }

    if (isOutdoor(plant)) {
      if (allowWeather) {
        double rain24 = weatherService.getAccumulatedRainMm(location, user == null ? null : user.getCityLat(), user == null ? null : user.getCityLon(), 24);
        double rain72 = weatherService.getAccumulatedRainMm(location, user == null ? null : user.getCityLat(), user == null ? null : user.getCityLon(), 72);
        if (rain24 >= 8.0 || rain72 >= 16.0) {
          return new WateringRecommendation(Math.max(2.0, interval), safeNonZeroLiters(0.0, plant));
        }
        if (rain24 >= 4.0 || rain72 >= 10.0) {
          interval = clamp(interval * 1.2, 1.0, 60.0);
        }
      }
    }

    double waterLiters = recommendWaterLiters(plant, weather.orElse(null));
    if (allowAi) {
      Optional<AIWateringProfile> aiProfile = openRouterPlantAdvisorService
          .suggestWateringProfile(plant, weather.orElse(null), isOutdoor(plant));
      if (aiProfile.isPresent()) {
        AIWateringProfile p = aiProfile.get();
        interval = clamp(interval * p.intervalFactor(), 1.0, 60.0);
        waterLiters = roundTwoDecimals(waterLiters * p.waterFactor());
      }
    }
    interval = clampIntervalByConfidence(base, interval, smoothedOpt.isPresent());

    if (allowSensors) {
      IntervalAdjustmentResult haAdjustment = haIntegrationService.applyHaAdjustment(plant, user, interval);
      if (haAdjustment.applied()) {
        interval = clamp(haAdjustment.intervalDays(), 1.0, 60.0);
        haIntegrationService.logAdjustment(plant, base, haAdjustment);
      }
    }

    waterLiters = enforceMinimumReasonableWater(plant, waterLiters);
    waterLiters = safeNonZeroLiters(waterLiters, plant);
    return new WateringRecommendation(interval, waterLiters);
  }

  public WateringRecommendation recommendQuick(Plant plant) {
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double plantFactor = plantFactor(plant);

    OptionalDouble smoothedOpt = learningService.getSmoothedInterval(plant);
    double learned = smoothedOpt.isPresent() ? smoothedOpt.getAsDouble() : base;

    double interval = learned * seasonFactor * plantFactor;
    interval = clamp(interval, 1.0, 60.0);
    interval = clampIntervalByConfidence(base, interval, smoothedOpt.isPresent());

    if (isOutdoor(plant) && isWinterDormancyActive(plant)) {
      return new WateringRecommendation(90.0, 0.0);
    }

    double waterLiters = recommendWaterLiters(plant, null);
    waterLiters = enforceMinimumReasonableWater(plant, waterLiters);
    waterLiters = safeNonZeroLiters(waterLiters, plant);
    return new WateringRecommendation(interval, waterLiters);
  }

  public WateringRecommendation recommendQuick(Plant plant, User user) {
    WateringRecommendation baseQuick = recommendQuick(plant);
    IntervalAdjustmentResult haAdjustment = haIntegrationService.applyHaAdjustment(plant, user, baseQuick.intervalDays());
    if (haAdjustment.applied()) {
      double adjustedInterval = clamp(haAdjustment.intervalDays(), 1.0, 60.0);
      haIntegrationService.logAdjustment(plant, baseQuick.intervalDays(), haAdjustment);
      return new WateringRecommendation(adjustedInterval, baseQuick.waterLiters());
    }
    return baseQuick;
  }

  private double seasonFactor(Month month) {
    return switch (month) {
      case JUNE, JULY, AUGUST -> 0.8;
      case DECEMBER, JANUARY, FEBRUARY -> 1.2;
      default -> 1.0;
    };
  }

  private double weatherFactor(WeatherData weather) {
    double factor = 1.0;
    if (weather.temperatureC() >= 28) {
      factor *= 0.85;
    } else if (weather.temperatureC() <= 10) {
      factor *= 1.15;
    }
    if (weather.humidityPercent() <= 40) {
      factor *= 0.9;
    } else if (weather.humidityPercent() >= 70) {
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
    return plant.getPlacement() == PlantPlacement.OUTDOOR;
  }

  private String resolvePlantWeatherLocation(Plant plant, User user) {
    if (plant != null) {
      if (plant.getCity() != null && !plant.getCity().isBlank()) {
        return plant.getCity().trim();
      }
      if (plant.getRegion() != null && !plant.getRegion().isBlank()) {
        return plant.getRegion().trim();
      }
    }
    return user == null || user.getCity() == null ? null : user.getCity().trim();
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
      return roundTwoDecimals(clamp(derived, 0.5, 25.0));
    }

    double pot = plant.getPotVolumeLiters() > 0 ? plant.getPotVolumeLiters() : 1.5;
    double percent = (plant.getType().getMinWaterPercent() + plant.getType().getMaxWaterPercent()) / 2.0;
    double derived = pot * percent;
    return roundTwoDecimals(clamp(Math.max(0.12, derived), 0.12, 3.0));
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
      return 0.88;
    }
    if (category == PlantCategory.OUTDOOR_DECORATIVE) {
      return 1.0;
    }
    return 1.0;
  }

  private double outdoorCategoryVolumeFactor(Plant plant) {
    PlantCategory category = plant.getCategory();
    if (category == PlantCategory.OUTDOOR_GARDEN) {
      return 1.25;
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
    return roundTwoDecimals(Math.max(liters, minReasonable));
  }

  private double clampIntervalByConfidence(double baseInterval, double interval, boolean hasHistory) {
    double minFactor = hasHistory ? 0.5 : 0.7;
    double maxFactor = hasHistory ? 2.0 : 1.5;
    double min = Math.max(1.0, baseInterval * minFactor);
    double max = Math.max(3.0, baseInterval * maxFactor);
    return clamp(interval, min, max);
  }
}
