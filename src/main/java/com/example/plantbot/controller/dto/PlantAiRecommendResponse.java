package com.example.plantbot.controller.dto;

import java.util.List;

public record PlantAiRecommendResponse(String source,
                                       Integer recommendedIntervalDays,
                                       Integer recommendedWaterMl,
                                       String summary,
                                       List<String> reasoning,
                                       List<String> warnings,
                                       String profile) {
}
