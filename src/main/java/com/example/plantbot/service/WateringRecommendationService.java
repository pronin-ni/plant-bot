package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
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

  public WateringRecommendation recommend(Plant plant, String city) {
    Optional<WeatherData> weather = weatherService.getCurrent(city);
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double weatherFactor = weather.map(this::weatherFactor).orElse(1.0);
    double potFactor = potFactor(plant.getPotVolumeLiters());

    OptionalDouble smoothedOpt = learningService.getSmoothedInterval(plant);
    double learned = smoothedOpt.isPresent() ? smoothedOpt.getAsDouble() : base;

    double interval = learned * seasonFactor * weatherFactor * potFactor;
    interval = clamp(interval, 1.0, 60.0);

    double waterLiters = recommendWaterLiters(plant);
    return new WateringRecommendation(interval, waterLiters);
  }

  public LearningInfo learningInfo(Plant plant, String city) {
    Optional<WeatherData> weather = weatherService.getCurrent(city);
    double base = plant.getBaseIntervalDays();
    double seasonFactor = seasonFactor(LocalDate.now().getMonth());
    double weatherFactor = weather.map(this::weatherFactor).orElse(1.0);
    double potFactor = potFactor(plant.getPotVolumeLiters());

    OptionalDouble avgActual = learningService.getAverageInterval(plant);
    OptionalDouble smoothed = learningService.getSmoothedInterval(plant);

    double learned = smoothed.isPresent() ? smoothed.getAsDouble() : base;
    double finalInterval = clamp(learned * seasonFactor * weatherFactor * potFactor, 1.0, 60.0);

    return new LearningInfo(base,
        avgActual.isPresent() ? avgActual.getAsDouble() : null,
        smoothed.isPresent() ? smoothed.getAsDouble() : null,
        seasonFactor,
        weatherFactor,
        potFactor,
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

  private double potFactor(double liters) {
    if (liters < 1.5) {
      return 0.9;
    }
    if (liters > 3.0) {
      return 1.1;
    }
    return 1.0;
  }

  private double recommendWaterLiters(Plant plant) {
    double min = plant.getType().getMinWaterPercent();
    double max = plant.getType().getMaxWaterPercent();
    double percent = (min + max) / 2.0;
    return roundTwoDecimals(plant.getPotVolumeLiters() * percent);
  }

  private double clamp(double value, double min, double max) {
    return Math.max(min, Math.min(max, value));
  }

  private double roundTwoDecimals(double value) {
    return Math.round(value * 100.0) / 100.0;
  }
}
