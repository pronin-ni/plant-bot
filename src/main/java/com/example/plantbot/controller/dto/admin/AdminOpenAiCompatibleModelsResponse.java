package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminOpenAiCompatibleModelsResponse(
    String baseUrl,
    String modelsUrl,
    String message,
    List<OpenAiCompatibleModelOptionResponse> models
) {
}
