package com.example.plantbot.service.dto;

import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;

import java.time.Instant;
import java.util.List;

public record WeatherFetchResult(
    boolean success,
    boolean degraded,
    boolean fallbackUsed,
    boolean staleFallbackUsed,
    WeatherProvider providerUsed,
    WeatherProvider attemptedPrimary,
    WeatherData current,
    List<WeatherForecastDay> forecast,
    Instant observedAt,
    String message
) {
  public boolean hasCurrent() {
    return current != null;
  }

  public boolean hasForecast() {
    return forecast != null && !forecast.isEmpty();
  }
}
