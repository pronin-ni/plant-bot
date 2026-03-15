package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;

public record SeedMigrationApplyResponse(
    boolean ok,
    Long plantId,
    PlantCategory category,
    PlantEnvironmentType environmentType
) {
}
