package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;

public record CreatePlantRequest(String name,
                                 Double potVolumeLiters,
                                 Integer baseIntervalDays,
                                 PlantType type,
                                 PlantPlacement placement,
                                 Double outdoorAreaM2,
                                 OutdoorSoilType outdoorSoilType,
                                 SunExposure sunExposure,
                                 Boolean mulched,
                                 Boolean perennial,
                                 Boolean winterDormancyEnabled) {
}
