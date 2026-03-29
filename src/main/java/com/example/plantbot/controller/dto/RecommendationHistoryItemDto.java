package com.example.plantbot.controller.dto;

import java.time.Instant;
import java.util.List;

public record RecommendationHistoryItemDto(
    Long id,
    Long plantId,
    Instant occurredAt,
    String eventType,
    String source,
    String currentSource,
    Integer previousIntervalDays,
    Integer newIntervalDays,
    Integer previousWaterMl,
    Integer newWaterMl,
    Integer deltaIntervalDays,
    Integer deltaWaterMl,
    String summary,
    List<String> reasoning,
    List<String> warnings,
    List<RecommendationHistoryFactorDto> factors,
    Boolean manualOverrideActive,
    String weatherContribution,
    String aiContribution,
    String seasonContribution,
    String learningContribution,
    String growthStage,
    String previousGrowthStage,
    String seedStage,
    String previousSeedStage,
    boolean meaningfulChange,
    String changeSignificance,
    boolean userActionRequired
) {
}
