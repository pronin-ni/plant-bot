package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;

import java.time.LocalDate;

public record PlantResponse(Long id,
                            String name,
                            PlantPlacement placement,
                            LocalDate lastWateredDate,
                            Integer baseIntervalDays,
                            LocalDate nextWateringDate,
                            Integer recommendedWaterMl,
                            PlantType type,
                            String photoUrl) {
}
