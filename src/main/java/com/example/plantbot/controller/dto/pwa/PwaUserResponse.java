package com.example.plantbot.controller.dto.pwa;

import java.util.Set;

public record PwaUserResponse(
    Long id,
    Long telegramId,
    String username,
    String firstName,
    String email,
    Set<String> roles
) {
}
