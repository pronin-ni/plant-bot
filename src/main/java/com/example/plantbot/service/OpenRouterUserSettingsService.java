package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OpenRouterUserSettingsService {
  private final OpenRouterApiKeyCryptoService cryptoService;
  private final UserService userService;

  @Value("${openrouter.api-key:}")
  private String fallbackApiKey;

  public String resolveApiKey(User user) {
    if (user != null) {
      String encrypted = user.getOpenrouterApiKeyEncrypted();
      if (encrypted != null && !encrypted.isBlank()) {
        return cryptoService.decrypt(encrypted);
      }
    }
    return fallbackApiKey;
  }

  public boolean hasUserApiKey(User user) {
    return user != null && user.getOpenrouterApiKeyEncrypted() != null && !user.getOpenrouterApiKeyEncrypted().isBlank();
  }

  public void updateUserApiKey(User user, String rawApiKey) {
    if (rawApiKey == null || rawApiKey.isBlank()) {
      user.setOpenrouterApiKeyEncrypted(null);
    } else {
      user.setOpenrouterApiKeyEncrypted(cryptoService.encrypt(rawApiKey.trim()));
    }
    userService.save(user);
  }
}

