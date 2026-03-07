package com.example.plantbot.controller.dto.pwa;

public record PwaAuthOAuthRequest(
    String code,
    String idToken,
    String accessToken,
    String redirectUri,
    String emailHint
) {
}
