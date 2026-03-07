package com.example.plantbot.controller.dto.pwa;

public record PwaAuthTelegramWidgetRequest(
    Long id,
    String firstName,
    String lastName,
    String username,
    String photoUrl,
    Long authDate,
    String hash
) {
}

