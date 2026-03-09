package com.example.plantbot.controller.dto;

public record OpenRouterTestResponse(
    boolean ok,
    String type,
    String model,
    String answer,
    String message
) {
}
