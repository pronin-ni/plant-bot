package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.pwa.PwaAuthOAuthRequest;
import com.example.plantbot.domain.AuthProviderType;

public interface AuthProviderVerifier {
  AuthProviderType provider();

  VerifiedExternalUser verify(PwaAuthOAuthRequest request);
}
