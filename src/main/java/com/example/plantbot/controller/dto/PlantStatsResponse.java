package com.example.plantbot.controller.dto;

public record PlantStatsResponse(Long plantId,
                                 String plantName,
                                 Double averageIntervalDays,
                                 long totalWaterings,
                                 boolean overdue,
                                 long overdueDays) {
}
