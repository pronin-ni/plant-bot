package com.example.plantbot.controller.dto;

public record PlantLearningResponse(Long plantId,
                                    String plantName,
                                    double baseIntervalDays,
                                    Double avgActualIntervalDays,
                                    Double smoothedIntervalDays,
                                    double seasonFactor,
                                    double weatherFactor,
                                    double potFactor,
                                    double finalIntervalDays,
                                    String lookupSource) {
}
