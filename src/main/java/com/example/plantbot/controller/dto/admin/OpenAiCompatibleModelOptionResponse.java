package com.example.plantbot.controller.dto.admin;

public record OpenAiCompatibleModelOptionResponse(
    String id,
    String name,
    Integer contextLength,
    String inputPrice,
    String outputPrice,
    boolean supportsImageToText,
    boolean available,
    boolean enabled,
    String providerId,
    String transport
) {
}
