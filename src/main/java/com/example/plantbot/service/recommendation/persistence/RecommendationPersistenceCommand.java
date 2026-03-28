package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.RecommendationSource;

import java.time.Instant;

public record RecommendationPersistenceCommand(
    Integer appliedIntervalDays,
    Integer appliedWaterMl,
    RecommendationSource source,
    String summary,
    String reasoningJson,
    String warningsJson,
    Double confidenceScore,
    Instant generatedAt,
    boolean updateBaseline,
    boolean manualOverrideActive,
    Integer manualWaterVolumeMl,
    boolean writeSnapshot,
    String weatherContextSnapshotJson
) {
}
