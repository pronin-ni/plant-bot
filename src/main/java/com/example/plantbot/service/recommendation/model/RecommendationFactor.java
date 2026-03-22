package com.example.plantbot.service.recommendation.model;

public record RecommendationFactor(
    String kind,
    String label,
    String effect,
    Double confidence,
    boolean applied
) {
}
