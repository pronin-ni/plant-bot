package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminMagicLinkAuditItemResponse(
    Instant at,
    String eventType,
    boolean success,
    String emailMasked,
    String ipAddress,
    Long userId,
    String message
) {
}
