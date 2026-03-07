package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;

public record PlantPresetSuggestionResponse(String name,
                                            PlantCategory category,
                                            boolean popular) {
}
