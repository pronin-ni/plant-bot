package com.example.plantbot.controller.dto;

public record OpenRouterRuntimeSettingsResponse(
    String textModel,
    String photoModel,
    boolean hasApiKey
) {
}
