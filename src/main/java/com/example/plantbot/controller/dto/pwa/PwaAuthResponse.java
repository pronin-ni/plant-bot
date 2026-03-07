package com.example.plantbot.controller.dto.pwa;

public record PwaAuthResponse(
    String accessToken,
    long expiresInSeconds,
    PwaUserResponse user
) {
}
