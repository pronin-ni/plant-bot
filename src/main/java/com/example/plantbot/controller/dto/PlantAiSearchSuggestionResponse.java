package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantType;

public record PlantAiSearchSuggestionResponse(
    String name,
    PlantCategory category,
    PlantType type,
    String hint
) {
}
