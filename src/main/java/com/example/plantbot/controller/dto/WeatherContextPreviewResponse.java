package com.example.plantbot.controller.dto;

import java.util.List;

public record WeatherContextPreviewResponse(
    boolean available,
    boolean degraded,
    boolean fallbackUsed,
    boolean staleFallbackUsed,
    String providerSource,
    String city,
    String region,
    Double temperatureNowC,
    Double humidityNowPercent,
    Double precipitationLast24hMm,
    Double precipitationForecastMm,
    Double maxTemperatureNext3DaysC,
    Double windNowMs,
    String confidence,
    List<String> warnings
) {
}
