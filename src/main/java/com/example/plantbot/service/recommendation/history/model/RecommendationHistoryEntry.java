package com.example.plantbot.service.recommendation.history.model;

import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedStage;

import java.time.Instant;
import java.util.List;

public record RecommendationHistoryEntry(
    Long id,
    Long plantId,
    Instant occurredAt,
    RecommendationHistoryEventType eventType,
    RecommendationHistorySource source,
    RecommendationSource currentSource,
    Integer previousIntervalDays,
    Integer newIntervalDays,
    Integer previousWaterMl,
    Integer newWaterMl,
    Integer deltaIntervalDays,
    Integer deltaWaterMl,
    String summary,
    List<String> reasoning,
    List<String> warnings,
    List<RecommendationHistoryFactorSummary> factors,
    Boolean manualOverrideActive,
    String weatherContribution,
    String aiContribution,
    String seasonContribution,
    String learningContribution,
    PlantGrowthStage growthStage,
    PlantGrowthStage previousGrowthStage,
    SeedStage seedStage,
    SeedStage previousSeedStage,
    boolean meaningfulChange,
    RecommendationHistoryChangeSignificance changeSignificance,
    boolean userActionRequired
) {
}
