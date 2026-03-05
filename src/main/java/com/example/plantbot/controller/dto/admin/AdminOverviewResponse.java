package com.example.plantbot.controller.dto.admin;

public record AdminOverviewResponse(
    long totalUsers,
    long totalPlants,
    long usersWithPlants,
    long indoorPlants,
    long outdoorPlants,
    long activeUsers7d,
    long activeUsers30d
) {
}
