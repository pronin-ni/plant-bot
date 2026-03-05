package com.example.plantbot.controller.dto;

import java.util.List;

public record PlantCareAdviceResponse(
    int wateringCycleDays,
    List<String> additives,
    String soilType,
    List<String> soilComposition,
    String note,
    String source
) {
}
