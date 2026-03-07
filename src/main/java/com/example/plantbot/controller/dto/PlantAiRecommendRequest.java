package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;

public record PlantAiRecommendRequest(String name,
                                      PlantCategory category,
                                      Double potVolumeLiters,
                                      Double heightCm,
                                      Double diameterCm) {
}
