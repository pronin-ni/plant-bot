package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminOpenRouterModelsResponse(
    String textModel,
    String photoModel,
    boolean hasApiKey,
    Instant updatedAt
) {
}
