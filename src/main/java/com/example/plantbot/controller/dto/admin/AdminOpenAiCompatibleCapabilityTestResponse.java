package com.example.plantbot.controller.dto.admin;

public record AdminOpenAiCompatibleCapabilityTestResponse(
    boolean ok,
    String capability,
    String message,
    String model,
    Long latencyMs,
    String baseUrl,
    Boolean jsonValid,
    Boolean visionSupported,
    String rawPreview
) {
}
