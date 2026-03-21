package com.example.plantbot.controller.dto;

import java.util.List;

public record PlantAiSearchResponse(
    boolean ok,
    String source,
    List<PlantAiSearchSuggestionResponse> suggestions
) {
}
