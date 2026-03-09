package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantType;

public record PlantAiRecommendRequest(String name,
                                      PlantEnvironmentType environmentType,
                                      PlantCategory category,
                                      PlantType plantType,
                                      Integer baseIntervalDays,
                                      Double potVolumeLiters,
                                      Double heightCm,
                                      Double diameterCm,
                                      String containerType,
                                      String growthStage,
                                      Boolean greenhouse,
                                      String soilType,
                                      String sunExposure,
                                      String region,
                                      Boolean mulched,
                                      Boolean dripIrrigation) {
}
