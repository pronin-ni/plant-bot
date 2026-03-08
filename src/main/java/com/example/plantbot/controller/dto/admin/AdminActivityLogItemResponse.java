package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminActivityLogItemResponse(
    Instant at,
    String type,
    Long userId,
    Long telegramId,
    String username,
    String message,
    String severity
) {
}
