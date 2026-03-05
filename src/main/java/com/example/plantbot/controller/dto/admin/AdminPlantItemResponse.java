package com.example.plantbot.controller.dto.admin;

import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;

import java.time.Instant;
import java.time.LocalDate;

public record AdminPlantItemResponse(
    Long id,
    String name,
    Long userId,
    Long telegramId,
    String username,
    PlantPlacement placement,
    PlantType type,
    Integer baseIntervalDays,
    LocalDate lastWateredDate,
    LocalDate nextWateringDate,
    Instant createdAt
) {
}
