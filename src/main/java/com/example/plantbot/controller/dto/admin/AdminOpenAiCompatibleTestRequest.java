package com.example.plantbot.controller.dto.admin;

public record AdminOpenAiCompatibleTestRequest(
    String baseUrl,
    String apiKey,
    String textModel,
    String visionModel,
    Integer requestTimeoutMs,
    Integer maxTokens
) {
}
