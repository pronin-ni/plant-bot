package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedWateringMode;

import java.util.List;

public record SeedRecommendationPreviewResponse(
    String source,
    SeedStage seedStage,
    PlantEnvironmentType targetEnvironmentType,
    String careMode,
    Integer recommendedCheckIntervalHours,
    SeedWateringMode recommendedWateringMode,
    Integer expectedGerminationDaysMin,
    Integer expectedGerminationDaysMax,
    String summary,
    List<String> reasoning,
    List<String> warnings
) {
}
