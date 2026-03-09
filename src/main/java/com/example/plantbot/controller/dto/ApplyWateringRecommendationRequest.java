package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.RecommendationSource;

public record ApplyWateringRecommendationRequest(
    RecommendationSource source,
    Integer recommendedIntervalDays,
    Integer recommendedWaterMl,
    String summary
) {
}
