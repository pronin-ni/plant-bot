package com.example.plantbot.controller.dto.admin;

public record AdminOpenAiCompatibleTestResponse(
    boolean ok,
    String message,
    String model,
    Long latencyMs,
    String baseUrl
) {
}
