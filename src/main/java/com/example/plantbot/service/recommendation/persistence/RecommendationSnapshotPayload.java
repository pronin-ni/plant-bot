package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.RecommendationSnapshotFlow;

import java.time.Instant;

public record RecommendationSnapshotPayload(
    RecommendationSnapshotFlow flow,
    RecommendationSource source,
    Integer recommendedIntervalDays,
    Integer recommendedWaterVolumeMl,
    String summary,
    String reasoningJson,
    String warningsJson,
    String weatherContextSnapshotJson,
    Double confidenceScore,
    Instant generatedAt
) {
}
