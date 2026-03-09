package com.example.plantbot.controller.dto.admin;

public record AdminOpenRouterTestResponse(
    boolean ok,
    String answer,
    String model,
    String message
) {
}
