package com.example.plantbot.service.recommendation.persistence;

public record PersistedRecommendationExplainability(
    String summary,
    String reasoningJson,
    String warningsJson
) {
}
