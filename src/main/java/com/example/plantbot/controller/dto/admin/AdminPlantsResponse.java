package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminPlantsResponse(
    List<AdminPlantItemResponse> items,
    int page,
    int size,
    long total
) {
}
