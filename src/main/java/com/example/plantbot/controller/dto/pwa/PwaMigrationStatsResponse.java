package com.example.plantbot.controller.dto.pwa;

import java.time.Instant;

public record PwaMigrationStatsResponse(
    long pwaUsers,
    long tmaUsers,
    double migrationRate,
    Instant lastUpdated
) {
}

