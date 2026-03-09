package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OpenRouterUserSettingsService {
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;

  @Value("${openrouter.api-key:}")
  private String fallbackApiKey;

  public String resolveApiKey(User user) {
    // OR3: для runtime используем только глобальный ключ OpenRouter.
    String global = resolveGlobalApiKey();
    if (global != null && !global.isBlank()) {
      return global;
    }
    return fallbackApiKey;
  }

  public String resolveGlobalApiKey() {
    var settings = openRouterGlobalSettingsService.getOrCreate();
    return openRouterGlobalSettingsService.resolveApiKey(settings);
  }

  public OpenRouterGlobalSettingsService.ResolvedModels resolveGlobalModels() {
    return openRouterGlobalSettingsService.resolveModels(openRouterGlobalSettingsService.getOrCreate());
  }
}
