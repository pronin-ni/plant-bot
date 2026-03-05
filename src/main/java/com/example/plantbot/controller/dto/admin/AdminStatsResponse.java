package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminStatsResponse(
    List<AdminStatsItemResponse> topCities,
    List<AdminStatsItemResponse> topPlantTypes,
    long overduePlants,
    long activeUsers7d,
    long activeUsers30d
) {
}
