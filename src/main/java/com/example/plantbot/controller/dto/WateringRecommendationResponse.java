package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.WateringMode;

import java.util.List;

public record WateringRecommendationResponse(
    RecommendationSource source,
    PlantEnvironmentType environmentType,
    Integer recommendedWaterVolumeMl,
    Integer recommendedIntervalDays,
    Integer recommendedWaterMl,
    WateringMode wateringMode,
    Double confidence,
    String summary,
    List<String> reasoning,
    List<String> warnings,
    Boolean weatherUsed,
    WeatherContextPreviewResponse weatherContextPreview,
    WateringCyclePreviewDto cyclePreview,
    WateringSensorContextDto sensorContext
) {
}
