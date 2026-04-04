package com.example.plantbot.controller.dto.admin;

import java.time.Instant;
import java.util.List;

public record AdminAiAnalyticsResponse(
    String period,
    Instant from,
    long total,
    long success,
    long failed,
    List<AdminAiAnalyticsRowResponse> rows
) {
}
