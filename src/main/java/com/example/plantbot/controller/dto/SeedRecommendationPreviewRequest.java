package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedContainerType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedSubstrateType;

import java.time.LocalDate;

public record SeedRecommendationPreviewRequest(
    String plantName,
    SeedStage seedStage,
    PlantEnvironmentType targetEnvironmentType,
    SeedContainerType seedContainerType,
    SeedSubstrateType seedSubstrateType,
    LocalDate sowingDate,
    Double germinationTemperatureC,
    Boolean underCover,
    Boolean growLight,
    String region
) {
}
