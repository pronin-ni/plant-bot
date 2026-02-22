package com.example.plantbot.service;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.util.WeatherData;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Month;
import java.util.Optional;
import java.util.OptionalDouble;

@Service
@RequiredArgsConstructor
public class WateringRecommendationService {
  private final WeatherService weatherService;
  private final LearningService learningService;

  public WateringRecommendation recommend(Plant plant, User user) {
    Optional<WeatherData> weather = weatherService.getCurrent(user.getCity(), user.getCityLat(), user.getCityLon());
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
      double rain24 = weatherService.getAccumulatedRainMm(user.getCity(), user.getCityLat(), user.getCityLon(), 24);
      double rain72 = weatherService.getAccumulatedRainMm(user.getCity(), user.getCityLat(), user.getCityLon(), 72);
      if (rain24 >= 8.0 || rain72 >= 16.0) {
        return new WateringRecommendation(Math.max(2.0, interval), 0.0);
      }
      if (rain24 >= 4.0 || rain72 >= 10.0) {
        interval = clamp(interval * 1.2, 1.0, 60.0);
      }
    }

    double waterLiters = recommendWaterLiters(plant, weather.orElse(null));
    return new WateringRecommendation(interval, waterLiters);
  }

  public LearningInfo learningInfo(Plant plant, User user) {
    Optional<WeatherData> weather = weatherService.getCurrent(user.getCity(), user.getCityLat(), user.getCityLon());
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double weatherFactor = weather.map(this::weatherFactor).orElse(1.0);
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
      return outdoorFactor(plant);
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
    if (isOutdoor(plant) && plant.getOutdoorAreaM2() != null && plant.getOutdoorAreaM2() > 0) {
      double litersPerM2 = switch (plant.getType()) {
        case SUCCULENT -> 2.0;
        case TROPICAL -> 6.0;
        case FERN -> 5.0;
        default -> 4.0;
      };
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
}
