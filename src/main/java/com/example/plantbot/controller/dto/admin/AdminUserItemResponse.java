package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminUserItemResponse(
    Long id,
    Long telegramId,
    String username,
    String firstName,
    String city,
    Instant createdAt,
    long plantCount
) {
}
