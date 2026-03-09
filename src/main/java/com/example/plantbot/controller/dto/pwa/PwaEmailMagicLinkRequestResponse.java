package com.example.plantbot.controller.dto.pwa;

import java.time.Instant;

public record PwaEmailMagicLinkRequestResponse(
    boolean ok,
    String message,
    Instant expiresAt,
    String debugToken
) {
}
