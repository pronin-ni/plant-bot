package com.example.plantbot.controller.dto;

public record AiRuntimeSettingsResponse(
    String activeTextProvider,
    String activeVisionProvider,
    String textModel,
    String visionModel,
    boolean openrouterHasApiKey,
    boolean openaiHasApiKey
) {
}
