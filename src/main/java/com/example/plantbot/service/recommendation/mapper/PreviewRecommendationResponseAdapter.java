package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.WateringCyclePreviewDto;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.WateringMode;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

@Component
public class PreviewRecommendationResponseAdapter {

  public WateringRecommendationResponse adapt(RecommendationResult result, RecommendationRequestContext context) {
    return new WateringRecommendationResponse(
        toRecommendationSource(result == null ? null : result.source()),
        context == null ? null : context.environmentType(),
        result == null ? null : result.recommendedWaterMl(),
        result == null ? null : result.recommendedIntervalDays(),
        result == null ? null : result.recommendedWaterMl(),
        inferWateringMode(result, context),
        result == null ? null : result.confidence(),
        result == null || result.explainability() == null ? null : result.explainability().summary(),
        result == null || result.explainability() == null || result.explainability().reasoning() == null ? List.of() : result.explainability().reasoning(),
        result == null || result.explainability() == null || result.explainability().warnings() == null ? List.of() : result.explainability().warnings(),
        result != null && result.weatherContext() != null && result.weatherContext().available(),
        toWeatherPreview(result == null ? null : result.weatherContext()),
        buildCyclePreview(result),
        result == null ? null : castSensorContext(result.sensorContext())
    );
  }

  private RecommendationSource toRecommendationSource(String source) {
    if (source == null || source.isBlank()) {
      return null;
    }
    try {
      return RecommendationSource.valueOf(source.trim().toUpperCase());
    } catch (Exception ex) {
      return null;
    }
  }

  private WateringMode inferWateringMode(RecommendationResult result, RecommendationRequestContext context) {
    Integer interval = result == null ? null : result.recommendedIntervalDays();
    Integer waterMl = result == null ? null : result.recommendedWaterMl();
    if (interval == null || waterMl == null) {
      return null;
    }
    if (interval >= 14) {
      return WateringMode.SOIL_CHECK_FIRST;
    }
    if (waterMl <= 200) {
      return WateringMode.LIGHT;
    }
    if (interval <= 2 && waterMl >= 500) {
      return WateringMode.DEEP;
    }
    if (context != null && context.mode() == RecommendationExecutionMode.WEATHER_ADJUSTED) {
      return WateringMode.STANDARD;
    }
    return WateringMode.STANDARD;
  }

  private WeatherContextPreviewResponse toWeatherPreview(WeatherContext weatherContext) {
    if (weatherContext == null) {
      return null;
    }
    return new WeatherContextPreviewResponse(
        weatherContext.available(),
        weatherContext.degraded(),
        weatherContext.fallbackUsed(),
        weatherContext.staleFallbackUsed(),
        weatherContext.providerUsed(),
        weatherContext.locationDisplayName(),
        null,
        weatherContext.temperatureNowC(),
        weatherContext.humidityNowPercent(),
        weatherContext.precipitationLast24hMm(),
        weatherContext.precipitationForecastNext72hMm(),
        weatherContext.maxTemperatureNext3DaysC(),
        weatherContext.windNowMs(),
        weatherContext.confidence(),
        weatherContext.warnings()
    );
  }

  private WateringCyclePreviewDto buildCyclePreview(RecommendationResult result) {
    if (result == null || result.recommendedIntervalDays() == null || result.recommendedIntervalDays() <= 0) {
      return null;
    }
    LocalDate start = LocalDate.now();
    List<LocalDate> dates = java.util.stream.Stream.iterate(
            start.plusDays(result.recommendedIntervalDays()),
            date -> date.plusDays(result.recommendedIntervalDays())
        )
        .limit(6)
        .toList();
    return new WateringCyclePreviewDto(dates);
  }

  private com.example.plantbot.controller.dto.WateringSensorContextDto castSensorContext(Object sensorContext) {
    if (sensorContext instanceof com.example.plantbot.controller.dto.WateringSensorContextDto dto) {
      return dto;
    }
    return null;
  }
}
