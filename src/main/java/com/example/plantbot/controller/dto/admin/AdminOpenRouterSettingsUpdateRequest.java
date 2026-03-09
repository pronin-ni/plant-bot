package com.example.plantbot.controller.dto.admin;

public record AdminOpenRouterSettingsUpdateRequest(
    String apiKey,
    String chatModel,
    String photoRecognitionModel,
    String photoDiagnosisModel
) {
}
