package com.example.plantbot.controller.dto;

public record OpenRouterModelPreferencesRequest(
    String plantModel,
    String chatModel,
    String photoIdentifyModel,
    String photoDiagnoseModel,
    String apiKey
) {
}
