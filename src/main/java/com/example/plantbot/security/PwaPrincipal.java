package com.example.plantbot.security;

public record PwaPrincipal(
    Long userId,
    String username,
    String email,
    Long telegramId
) {
}
