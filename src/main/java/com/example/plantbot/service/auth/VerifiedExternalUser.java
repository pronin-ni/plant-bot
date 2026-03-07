package com.example.plantbot.service.auth;

import com.example.plantbot.domain.AuthProviderType;

public record VerifiedExternalUser(
    AuthProviderType provider,
    String providerSubject,
    String email,
    boolean emailVerified,
    String username,
    String firstName,
    String lastName,
    Long telegramId
) {
}
