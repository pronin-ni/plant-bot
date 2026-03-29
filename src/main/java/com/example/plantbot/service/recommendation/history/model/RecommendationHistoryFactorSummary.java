package com.example.plantbot.service.recommendation.history.model;

public record RecommendationHistoryFactorSummary(
    String type,
    String label,
    String impactText,
    String direction
) {
}
