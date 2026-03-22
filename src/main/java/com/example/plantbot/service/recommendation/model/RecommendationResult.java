package com.example.plantbot.service.recommendation.model;

import java.time.Instant;

public record RecommendationResult(
    Integer recommendedIntervalDays,
    Integer recommendedWaterMl,
    String source,
    RecommendationExecutionMode mode,
    Double confidence,
    RecommendationExplainability explainability,
    WeatherContext weatherContext,
    Object sensorContext,
    Instant generatedAt,
    boolean manualOverrideActive
) {
}
