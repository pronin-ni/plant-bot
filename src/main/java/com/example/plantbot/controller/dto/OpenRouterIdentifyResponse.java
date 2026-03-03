package com.example.plantbot.controller.dto;

import java.util.List;

public record OpenRouterIdentifyResponse(
    String russianName,
    String latinName,
    String family,
    int confidence,
    int wateringIntervalDays,
    String lightLevel,
    String humidityPercent,
    String shortDescription,
    List<String> alternatives
) {
}
