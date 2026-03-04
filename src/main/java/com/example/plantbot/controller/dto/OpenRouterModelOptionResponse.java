package com.example.plantbot.controller.dto;

public record OpenRouterModelOptionResponse(
    String id,
    String name,
    Integer contextLength,
    String inputPrice,
    String outputPrice,
    boolean free
) {
}

