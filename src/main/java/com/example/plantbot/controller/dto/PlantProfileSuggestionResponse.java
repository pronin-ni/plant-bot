package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantType;

public record PlantProfileSuggestionResponse(
    boolean found,
    int intervalDays,
    PlantType type,
    String source
) {
}
