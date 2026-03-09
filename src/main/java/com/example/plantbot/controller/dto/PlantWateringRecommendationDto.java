package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationSource;

import java.util.List;

public record PlantWateringRecommendationDto(
    RecommendationSource source,
    PlantEnvironmentType environmentType,
    Integer intervalDays,
    Integer waterMl,
    String summary,
    List<String> reasoning,
    List<String> warnings
) {
}
