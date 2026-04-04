package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminAiAnalyticsRowResponse(
    String requestKind,
    String provider,
    String model,
    long total,
    long success,
    long failed,
    Instant lastSuccessAt,
    Instant lastFailureAt
) {
}
