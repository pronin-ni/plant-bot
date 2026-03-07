package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.pwa.PwaAuthOAuthRequest;
import com.example.plantbot.domain.AuthProviderType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class YandexAuthProviderVerifier implements AuthProviderVerifier {
  @Override
  public AuthProviderType provider() {
    return AuthProviderType.YANDEX;
  }

  @Override
  public VerifiedExternalUser verify(PwaAuthOAuthRequest request) {
    String subject = normalizeSubject(request);
    return new VerifiedExternalUser(
        provider(),
        subject,
        normalizeEmail(request == null ? null : request.emailHint()),
        request != null && request.emailHint() != null && !request.emailHint().isBlank(),
        null,
        null,
        null,
        null
    );
  }

  private String normalizeSubject(PwaAuthOAuthRequest request) {
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Требуется OAuth payload");
    }
    String raw = firstNonBlank(request.idToken(), request.code(), request.accessToken());
    if (raw == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Нужен code/idToken/accessToken");
    }
    return "yandex:" + Math.abs(raw.trim().hashCode());
  }

  private String normalizeEmail(String email) {
    if (email == null || email.isBlank()) {
      return null;
    }
    return email.trim().toLowerCase();
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }
}
