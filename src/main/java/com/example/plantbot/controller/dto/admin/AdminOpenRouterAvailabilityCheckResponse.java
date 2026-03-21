package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminOpenRouterAvailabilityCheckResponse(
    String type,
    String model,
    String status,
    String message,
    Instant checkedAt,
    Instant successfulAt
) {
}
