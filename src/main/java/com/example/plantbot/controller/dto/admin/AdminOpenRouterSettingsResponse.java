package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminOpenRouterSettingsResponse(
    boolean hasApiKey,
    String apiKeyMasked,
    String chatModel,
    String photoRecognitionModel,
    String photoDiagnosisModel,
    Instant updatedAt
) {
}
