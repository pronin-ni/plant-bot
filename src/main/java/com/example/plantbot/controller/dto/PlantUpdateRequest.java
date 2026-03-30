package com.example.plantbot.controller.dto;

public record PlantUpdateRequest(
    Double potVolumeLiters,
    Integer preferredWaterMl,
    Integer baseIntervalDays
) {
}
