package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
public class RecommendationResultMapper {

  public RecommendationResult fromPreviewResponse(
      WateringRecommendationResponse response,
      RecommendationExecutionMode fallbackMode,
      boolean manualOverrideActive
  ) {
    if (response == null) {
      return new RecommendationResult(
          null,
          null,
          null,
          fallbackMode,
          null,
          new RecommendationExplainability(
              null,
              fallbackMode,
              null,
              List.of(),
              List.of(),
              List.of(),
              null,
              null,
              null,
              null,
              null
          ),
          null,
          null,
          Instant.now(),
          manualOverrideActive
      );
    }

    WeatherContext weatherContext = response.weatherContextPreview() == null
        ? null
        : new WeatherContext(
            response.weatherContextPreview().available(),
            response.weatherContextPreview().degraded(),
            response.weatherContextPreview().fallbackUsed(),
            response.weatherContextPreview().staleFallbackUsed(),
            response.weatherContextPreview().providerSource(),
            firstNonBlank(response.weatherContextPreview().city(), response.weatherContextPreview().region()),
            response.weatherContextPreview().temperatureNowC(),
            response.weatherContextPreview().humidityNowPercent(),
            response.weatherContextPreview().precipitationLast24hMm(),
            response.weatherContextPreview().precipitationForecastMm(),
            response.weatherContextPreview().maxTemperatureNext3DaysC(),
            response.weatherContextPreview().windNowMs(),
            response.weatherContextPreview().confidence(),
            response.weatherContextPreview().warnings()
        );

    RecommendationExecutionMode mode = fallbackMode != null ? fallbackMode : RecommendationExecutionMode.HYBRID;
    RecommendationExplainability explainability = new RecommendationExplainability(
        response.source() == null ? null : response.source().name(),
        mode,
        response.summary(),
        response.reasoning() == null ? List.of() : response.reasoning(),
        response.warnings() == null ? List.of() : response.warnings(),
        List.of(
            new RecommendationFactor("SOURCE", "Recommendation source", response.source() == null ? null : response.source().name(), response.confidence(), true)
        ),
        weatherContext == null ? null : weatherContext.locationDisplayName(),
        response.sensorContext() == null ? null : response.sensorContext().source(),
        response.source() == null ? null : response.source().name(),
        null,
        manualOverrideActive ? "Manual override active" : null
    );

    return new RecommendationResult(
        response.recommendedIntervalDays(),
        response.recommendedWaterVolumeMl() == null ? response.recommendedWaterMl() : response.recommendedWaterVolumeMl(),
        response.source() == null ? null : response.source().name(),
        mode,
        response.confidence(),
        explainability,
        weatherContext,
        response.sensorContext(),
        Instant.now(),
        manualOverrideActive
    );
  }

  private String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) {
      return first;
    }
    if (second != null && !second.isBlank()) {
      return second;
    }
    return null;
  }
}
