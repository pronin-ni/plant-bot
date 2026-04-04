package com.example.plantbot.service;

import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiExecutionService {
  private final AiProviderSettingsService aiProviderSettingsService;
  private final OpenRouterExecutionService openRouterExecutionService;
  private final OpenAiExecutionService openAiExecutionService;
  private final AiRequestAnalyticsService aiRequestAnalyticsService;

  public AiExecutionResult executeConfiguredText(User user, AiRequestKind requestKind, List<Map<String, Object>> messages) {
    return execute(aiProviderSettingsService.resolveTextRuntime(user), requestKind, messages);
  }

  public AiExecutionResult executeConfiguredVision(User user, AiRequestKind requestKind, List<Map<String, Object>> messages) {
    return execute(aiProviderSettingsService.resolveVisionRuntime(user), requestKind, messages);
  }

  public AiExecutionResult execute(AiProviderSettingsService.RuntimeResolution runtime, AiRequestKind requestKind, List<Map<String, Object>> messages) {
    if (runtime == null || !runtime.hasApiKey() || runtime.model() == null || runtime.model().isBlank()) {
      throw new IllegalStateException("AI runtime is not configured");
    }

    long startedAt = System.nanoTime();
    try {
      JsonNode payload = runtime.provider() == AiProviderType.OPENAI
          ? openAiExecutionService.executeChatCompletion(runtime.apiKey(), runtime.model(), messages)
          : openRouterExecutionService.executeChatCompletion(
              runtime.apiKey(),
              runtime.model(),
              runtime.capability() == AiCapability.VISION ? OpenRouterModelKind.PHOTO : OpenRouterModelKind.TEXT,
              null,
              null,
              null,
              messages
          );
      aiRequestAnalyticsService.record(
          requestKind,
          runtime.provider(),
          runtime.capability(),
          runtime.model(),
          true,
          null,
          elapsedMs(startedAt)
      );
      return new AiExecutionResult(runtime.provider(), runtime.capability(), runtime.model(), payload);
    } catch (Exception ex) {
      aiRequestAnalyticsService.record(
          requestKind,
          runtime.provider(),
          runtime.capability(),
          runtime.model(),
          false,
          ex.getMessage(),
          elapsedMs(startedAt)
      );
      throw ex;
    }
  }

  public void recordConfigurationFailure(AiProviderSettingsService.RuntimeResolution runtime,
                                         AiRequestKind requestKind,
                                         String reason) {
    if (runtime == null) {
      return;
    }
    aiRequestAnalyticsService.record(
        requestKind,
        runtime.provider(),
        runtime.capability(),
        runtime.model(),
        false,
        reason == null || reason.isBlank() ? "AI runtime is not configured" : reason.trim(),
        0L
    );
  }

  private long elapsedMs(long startedAt) {
    return Math.max(1L, System.nanoTime() - startedAt) / 1_000_000L;
  }

  public record AiExecutionResult(
      AiProviderType provider,
      AiCapability capability,
      String model,
      JsonNode body
  ) {
    public String sourceLabel() {
      return provider.name() + ":" + model;
    }

    public String cacheModelKey() {
      return provider.name() + ":" + model;
    }
  }
}
