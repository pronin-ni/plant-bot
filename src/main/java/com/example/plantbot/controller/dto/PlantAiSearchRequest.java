package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;

public record PlantAiSearchRequest(
    String query,
    PlantCategory category
) {
}
