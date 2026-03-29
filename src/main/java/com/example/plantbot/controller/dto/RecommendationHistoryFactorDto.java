package com.example.plantbot.controller.dto;

public record RecommendationHistoryFactorDto(
    String type,
    String label,
    String impactText,
    String direction
) {
}
