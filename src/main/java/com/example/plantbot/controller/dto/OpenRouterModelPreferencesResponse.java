package com.example.plantbot.controller.dto;

public record OpenRouterModelPreferencesResponse(
    String plantModel,
    String chatModel,
    String photoIdentifyModel,
    String photoDiagnoseModel,
    boolean hasApiKey
) {
}
