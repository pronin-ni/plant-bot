package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;

import java.time.Instant;
import java.time.LocalDate;

public record PlantResponse(Long id,
                            String name,
                            PlantPlacement placement,
                            PlantCategory category,
                            PlantEnvironmentType wateringProfile,
                            String region,
                            PlantContainerType containerType,
                            Double containerVolumeLiters,
                            String cropType,
                            PlantGrowthStage growthStage,
                            Boolean greenhouse,
                            Boolean dripIrrigation,
                            Double potVolumeLiters,
                            Double outdoorAreaM2,
                            OutdoorSoilType outdoorSoilType,
                            SunExposure sunExposure,
                            Boolean mulched,
                            Boolean perennial,
                            Boolean winterDormancyEnabled,
                            LocalDate lastWateredDate,
                            Integer baseIntervalDays,
                            Integer preferredWaterMl,
                            LocalDate nextWateringDate,
                            Integer recommendedWaterMl,
                            PlantType type,
                            String photoUrl,
                            Instant createdAt) {
}
