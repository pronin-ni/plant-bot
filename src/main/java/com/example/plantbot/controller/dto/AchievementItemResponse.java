package com.example.plantbot.controller.dto;

public record AchievementItemResponse(
    String key,
    String title,
    String description,
    String icon,
    int progress,
    int target,
    boolean unlocked
) {
}
