package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.RecommendationSource;

import java.time.Instant;

public record RecommendationPersistencePlan(
    RecommendationPersistenceFlow flow,
    Integer baselineIntervalDays,
    Integer baselineWaterMl,
    Integer appliedIntervalDays,
    Integer appliedWaterMl,
    RecommendationSource appliedSource,
    String appliedSummary,
    String appliedReasoningJson,
    String appliedWarningsJson,
    Double appliedConfidenceScore,
    Instant appliedGeneratedAt,
    boolean manualOverrideActive,
    Integer manualWaterVolumeMl,
    RecommendationSource lastRecommendationSource,
    Integer lastRecommendedIntervalDays,
    Integer lastRecommendedWaterMl,
    String lastRecommendationSummary,
    Instant lastRecommendationUpdatedAt,
    RecommendationSnapshotPayload snapshotPayload
) {
}
