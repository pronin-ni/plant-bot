package com.example.plantbot.controller.dto.admin;

public record AdminPlantActionResponse(
    boolean ok,
    Long plantId,
    String message
) {
}
