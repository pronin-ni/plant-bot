package com.example.plantbot.service.recommendation.model;

import java.util.List;

public record WeatherContext(
    boolean available,
    boolean degraded,
    boolean fallbackUsed,
    boolean staleFallbackUsed,
    String providerUsed,
    String locationDisplayName,
    Double temperatureNowC,
    Double humidityNowPercent,
    Double precipitationLast24hMm,
    Double precipitationForecastNext72hMm,
    Double maxTemperatureNext3DaysC,
    Double windNowMs,
    String confidence,
    List<String> warnings
) {
}
