package com.example.plantbot.service.dto;

import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;

import java.util.List;

public record NormalizedWeatherContext(
    boolean available,
    boolean degraded,
    boolean fallbackUsed,
    boolean staleFallbackUsed,
    WeatherProvider providerUsed,
    String city,
    String region,
    Double temperatureNowC,
    Double humidityNowPercent,
    Double precipitationLast24hMm,
    Double precipitationForecastNext72hMm,
    Double maxTemperatureNext3DaysC,
    Double windNowMs,
    WeatherConfidence confidence,
    List<String> warnings
) {
}
