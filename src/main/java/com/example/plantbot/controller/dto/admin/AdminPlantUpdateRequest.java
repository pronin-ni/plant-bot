package com.example.plantbot.controller.dto.admin;

import com.example.plantbot.domain.PlantCategory;

public record AdminPlantUpdateRequest(
    String name,
    Integer baseIntervalDays,
    PlantCategory category
) {
}
