package com.example.plantbot.controller.dto.weather;

public record WeatherCurrentResponse(String city,
                                     double tempC,
                                     double humidity,
                                     String icon,
                                     String description,
                                     String source) {
}
