package com.example.plantbot.controller.dto;

public record PlantAiRecommendResponse(Integer wateringFrequencyDays,
                                       Integer wateringVolumeMl,
                                       String light,
                                       String soil,
                                       String notes,
                                       String source) {
}
