package com.example.plantbot.controller.dto.admin;

public record AdminOpenAiCompatibleModelsRequest(
    String baseUrl,
    String modelsUrl,
    String apiKey
) {
}
