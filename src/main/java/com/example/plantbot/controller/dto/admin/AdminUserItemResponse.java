package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminUserItemResponse(
    Long id,
    Long telegramId,
    String username,
    String firstName,
    String email,
    String city,
    Instant createdAt,
    Instant lastSeenAt,
    Boolean blocked,
    long plantCount
) {
}
