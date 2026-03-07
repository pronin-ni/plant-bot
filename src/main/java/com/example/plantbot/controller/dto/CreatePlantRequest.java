package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;

public record CreatePlantRequest(String name,
                                 Double potVolumeLiters,
                                 Integer baseIntervalDays,
                                 Integer preferredWaterMl,
                                 PlantType type,
                                 PlantPlacement placement,
                                 PlantCategory category,
                                 Double outdoorAreaM2,
                                 OutdoorSoilType outdoorSoilType,
                                 SunExposure sunExposure,
                                 Boolean mulched,
                                 Boolean perennial,
                                 Boolean winterDormancyEnabled) {
}
