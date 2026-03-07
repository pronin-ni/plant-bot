package com.example.plantbot.controller.dto.pwa;

public record PwaMigrationDecisionResponse(
    boolean inExperiment,
    String variant,
    int rolloutPercent,
    boolean shouldShowPrompt,
    boolean shouldAutoOpen,
    String pwaUrl
) {
}

