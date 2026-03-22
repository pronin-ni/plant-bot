package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class WeatherContextAdapter {

  public WeatherContext fromNormalized(
      NormalizedWeatherContext source,
      String locationDisplayName,
      RecommendationFlowType flowType
  ) {
    if (source == null) {
      return unavailable("Погодный слой не смог вернуть данные.");
    }

    List<String> warnings = source.warnings() == null ? List.of() : source.warnings();
    String effectiveDisplay = !isBlank(locationDisplayName)
        ? locationDisplayName
        : !isBlank(source.city())
          ? source.city()
          : source.region();

    return new WeatherContext(
        source.available(),
        source.degraded(),
        source.fallbackUsed(),
        source.staleFallbackUsed(),
        source.providerUsed() == null ? null : source.providerUsed().name(),
        effectiveDisplay,
        source.temperatureNowC(),
        source.humidityNowPercent(),
        source.precipitationLast24hMm(),
        source.precipitationForecastNext72hMm(),
        source.maxTemperatureNext3DaysC(),
        source.windNowMs(),
        source.confidence() == null ? null : source.confidence().name(),
        addFlowHintIfNeeded(warnings, flowType)
    );
  }

  public WeatherContext unavailable(String warning) {
    return new WeatherContext(
        false,
        true,
        false,
        false,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        warning == null ? List.of() : List.of(warning)
    );
  }

  private List<String> addFlowHintIfNeeded(List<String> warnings, RecommendationFlowType flowType) {
    if (flowType == null) {
      return warnings;
    }
    if (flowType == RecommendationFlowType.NOTIFICATION && warnings.isEmpty()) {
      return List.of("Notification flow использует тот же нормализованный weather context.");
    }
    return warnings;
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
