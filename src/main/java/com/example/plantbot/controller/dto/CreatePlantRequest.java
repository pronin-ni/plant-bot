package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SeedContainerType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedSubstrateType;
import com.example.plantbot.domain.SeedWateringMode;
import com.example.plantbot.domain.SunExposure;

import java.time.LocalDate;

public record CreatePlantRequest(String name,
                                 Double potVolumeLiters,
                                 Integer baseIntervalDays,
                                 Integer preferredWaterMl,
                                 PlantType type,
                                 PlantPlacement placement,
                                 PlantCategory category,
                                 PlantEnvironmentType environmentType,
                                 // Временное поле совместимости, можно удалить после миграции клиентов.
                                 PlantEnvironmentType wateringProfile,
                                 String region,
                                 PlantContainerType containerType,
                                 Double containerVolumeLiters,
                                 String cropType,
                                 PlantGrowthStage growthStage,
                                 SeedStage seedStage,
                                 PlantEnvironmentType targetEnvironmentType,
                                 SeedContainerType seedContainerType,
                                 SeedSubstrateType seedSubstrateType,
                                 LocalDate sowingDate,
                                 Boolean underCover,
                                 Boolean growLight,
                                 Double germinationTemperatureC,
                                 Integer expectedGerminationDaysMin,
                                 Integer expectedGerminationDaysMax,
                                 Integer recommendedCheckIntervalHours,
                                 SeedWateringMode recommendedWateringMode,
                                 String seedCareMode,
                                 String seedSummary,
                                 String seedReasoningJson,
                                 String seedWarningsJson,
                                 String seedCareSource,
                                 Boolean greenhouse,
                                 Boolean dripIrrigation,
                                 Double outdoorAreaM2,
                                 OutdoorSoilType outdoorSoilType,
                                 SunExposure sunExposure,
                                 Boolean mulched,
                                 Boolean perennial,
                                 Boolean winterDormancyEnabled) {
}
