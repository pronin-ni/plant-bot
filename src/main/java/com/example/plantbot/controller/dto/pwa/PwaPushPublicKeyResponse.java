package com.example.plantbot.controller.dto.pwa;

public record PwaPushPublicKeyResponse(
    boolean enabled,
    String publicKey
) {
}

