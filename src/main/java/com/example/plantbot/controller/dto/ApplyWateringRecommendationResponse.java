package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.RecommendationSource;

import java.time.Instant;

public record ApplyWateringRecommendationResponse(
    boolean ok,
    Long plantId,
    RecommendationSource source,
    Integer baseIntervalDays,
    Integer preferredWaterMl,
    Instant recommendationUpdatedAt
) {
}
