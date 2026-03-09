package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.RecommendationSource;

import java.time.Instant;

public record RecommendationSnapshotResponse(
    Long id,
    Long plantId,
    RecommendationSource source,
    Integer recommendedIntervalDays,
    Integer recommendedWaterVolumeMl,
    String summary,
    String reasoningJson,
    String warningsJson,
    String weatherContextSnapshotJson,
    Double confidenceScore,
    Instant generatedAt,
    Instant createdAt
) {
}
