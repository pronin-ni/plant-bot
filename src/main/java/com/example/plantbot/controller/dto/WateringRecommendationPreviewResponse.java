package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.WateringMode;

import java.time.Instant;
import java.util.List;

public record WateringRecommendationPreviewResponse(
    RecommendationSource source,
    Integer recommendedIntervalDays,
    Integer recommendedWaterVolumeMl,
    WateringMode wateringMode,
    String summary,
    List<String> reasoning,
    List<String> warnings,
    Double confidenceScore,
    WateringCyclePreviewDto cyclePreview,
    WeatherContextPreviewResponse weatherContextPreview,
    Instant generatedAt
) {
}
