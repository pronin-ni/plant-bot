package com.example.plantbot.util;

public record WeatherForecastDay(
    String dateIso,
    double tempC,
    Double humidity,
    Double precipitationMm,
    String description
) {
}
