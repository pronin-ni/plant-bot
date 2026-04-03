package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantAvatarSource;

public record PlantAvatarResponse(
    String cacheKey,
    String svg,
    PlantAvatarSource source
) {
}
