package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;

import java.time.LocalDate;

public record PlantResponse(Long id,
                            String name,
                            PlantPlacement placement,
                            Double potVolumeLiters,
                            Double outdoorAreaM2,
                            OutdoorSoilType outdoorSoilType,
                            SunExposure sunExposure,
                            Boolean mulched,
                            Boolean perennial,
                            Boolean winterDormancyEnabled,
                            LocalDate lastWateredDate,
                            Integer baseIntervalDays,
                            LocalDate nextWateringDate,
                            Integer recommendedWaterMl,
                            PlantType type,
                            String photoUrl) {
}
