package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedStage;

public record SeedMigrationPreviewResponse(
    boolean allowed,
    Long plantId,
    SeedStage seedStage,
    PlantEnvironmentType targetEnvironmentType,
    String targetLabel,
    String plantName,
    String message
) {
}
