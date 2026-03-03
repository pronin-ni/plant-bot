package com.example.plantbot.controller.dto;

import java.util.List;

public record AchievementsResponse(int unlocked, int total, List<AchievementItemResponse> items) {
}
