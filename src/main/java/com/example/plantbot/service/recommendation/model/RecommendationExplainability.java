package com.example.plantbot.service.recommendation.model;

import java.util.List;

public record RecommendationExplainability(
    String source,
    RecommendationExecutionMode mode,
    String summary,
    List<String> reasoning,
    List<String> warnings,
    List<RecommendationFactor> factors,
    String weatherContribution,
    String sensorContribution,
    String aiContribution,
    String learningContribution,
    String manualOverrideContribution
) {
}
