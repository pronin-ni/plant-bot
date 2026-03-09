package com.example.plantbot.controller.dto.pwa;

import java.time.Instant;

public record PwaEmailMagicLinkRequestAccepted(
    String token,
    Instant expiresAt
) {
}
