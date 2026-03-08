package com.example.plantbot.controller.dto.admin;

public record AdminBulkPlantWaterResponse(
    boolean ok,
    int total,
    int updated,
    int skipped,
    String message
) {
}
