package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleCapabilityTestResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleTestRequest;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenAiCompatibleAdminTestService {
  private static final String TINY_PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pY8kAAAAASUVORK5CYII=";

  private final AiProviderSettingsService aiProviderSettingsService;
  private final OpenAiExecutionService openAiExecutionService;
  private final AiRequestAnalyticsService aiRequestAnalyticsService;
  private final ObjectMapper objectMapper;

  public AdminOpenAiCompatibleCapabilityTestResponse testConnection(User admin,
                                                                    AdminOpenAiCompatibleTestRequest request) {
    AiProviderSettingsService.RuntimeResolution runtime = runtimeFor(request, admin, AiCapability.TEXT);
    return executeTextLikeTest(
        runtime,
        AiRequestKind.ADMIN_PROVIDER_TEST_CONNECTION,
        List.of(
            Map.of("role", "system", "content", "You are a compatibility probe. Reply with exactly: ok"),
            Map.of("role", "user", "content", "ok")
        ),
        "connection"
    );
  }

  public AdminOpenAiCompatibleCapabilityTestResponse testJson(User admin,
                                                              AdminOpenAiCompatibleTestRequest request) {
    AiProviderSettingsService.RuntimeResolution runtime = runtimeFor(request, admin, AiCapability.TEXT);
    if (!isConfigured(runtime, AiRequestKind.ADMIN_PROVIDER_TEST_JSON)) {
      return configurationFailure(runtime, "json", null, null);
    }

    long startedAt = System.nanoTime();
    try {
      JsonNode payload = openAiExecutionService.executeChatCompletion(
          runtime.apiKey(),
          runtime.baseUrl(),
          runtime.model(),
          runtime.requestTimeoutMs(),
          runtime.maxTokens(),
          List.of(
              Map.of("role", "system", "content", "Return only strict JSON. No markdown. No explanation."),
              Map.of("role", "user", "content", "Return this exact JSON object with identical keys and types: {\"ok\":true,\"kind\":\"json-test\",\"value\":7}")
          )
      );
      String content = extractMessageContent(payload);
      JsonNode parsed = parseJsonContent(content);
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(
          AiRequestKind.ADMIN_PROVIDER_TEST_JSON,
          runtime.provider(),
          runtime.capability(),
          runtime.analyticsModelKey(),
          true,
          null,
          latencyMs
      );
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          true,
          "json",
          "JSON test successful",
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          parsed.isObject(),
          null,
          preview(content)
      );
    } catch (Exception ex) {
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(
          AiRequestKind.ADMIN_PROVIDER_TEST_JSON,
          runtime.provider(),
          runtime.capability(),
          runtime.analyticsModelKey(),
          false,
          ex.getMessage(),
          latencyMs
      );
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          false,
          "json",
          ex.getMessage(),
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          false,
          null,
          null
      );
    }
  }

  public AdminOpenAiCompatibleCapabilityTestResponse testVision(User admin,
                                                                AdminOpenAiCompatibleTestRequest request) {
    AiProviderSettingsService.RuntimeResolution runtime = runtimeFor(request, admin, AiCapability.VISION);
    if (!isConfigured(runtime, AiRequestKind.ADMIN_PROVIDER_TEST_VISION)) {
      return configurationFailure(runtime, "vision", null, false);
    }

    long startedAt = System.nanoTime();
    try {
      JsonNode payload = openAiExecutionService.executeChatCompletion(
          runtime.apiKey(),
          runtime.baseUrl(),
          runtime.model(),
          runtime.requestTimeoutMs(),
          runtime.maxTokens(),
          List.of(
              Map.of("role", "system", "content", "You are a vision compatibility probe. Reply briefly."),
              Map.of(
                  "role", "user",
                  "content", List.of(
                      Map.of("type", "text", "text", "Confirm that an image was received in one short sentence."),
                      Map.of("type", "image_url", "image_url", Map.of("url", TINY_PNG_DATA_URI))
                  )
              )
          )
      );
      String content = extractMessageContent(payload);
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(
          AiRequestKind.ADMIN_PROVIDER_TEST_VISION,
          runtime.provider(),
          runtime.capability(),
          runtime.analyticsModelKey(),
          true,
          null,
          latencyMs
      );
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          true,
          "vision",
          "Vision test successful",
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          null,
          true,
          preview(content)
      );
    } catch (Exception ex) {
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(
          AiRequestKind.ADMIN_PROVIDER_TEST_VISION,
          runtime.provider(),
          runtime.capability(),
          runtime.analyticsModelKey(),
          false,
          ex.getMessage(),
          latencyMs
      );
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          false,
          "vision",
          ex.getMessage(),
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          null,
          false,
          null
      );
    }
  }

  private AdminOpenAiCompatibleCapabilityTestResponse executeTextLikeTest(AiProviderSettingsService.RuntimeResolution runtime,
                                                                          AiRequestKind requestKind,
                                                                          List<Map<String, Object>> messages,
                                                                          String capability) {
    if (!isConfigured(runtime, requestKind)) {
      return configurationFailure(runtime, capability, null, null);
    }
    long startedAt = System.nanoTime();
    try {
      JsonNode payload = openAiExecutionService.executeChatCompletion(
          runtime.apiKey(),
          runtime.baseUrl(),
          runtime.model(),
          runtime.requestTimeoutMs(),
          runtime.maxTokens(),
          messages
      );
      String content = extractMessageContent(payload);
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(requestKind, runtime.provider(), runtime.capability(), runtime.analyticsModelKey(), true, null, latencyMs);
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          true,
          capability,
          "Connection test successful",
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          null,
          null,
          preview(content)
      );
    } catch (Exception ex) {
      long latencyMs = elapsedMs(startedAt);
      aiRequestAnalyticsService.record(requestKind, runtime.provider(), runtime.capability(), runtime.analyticsModelKey(), false, ex.getMessage(), latencyMs);
      return new AdminOpenAiCompatibleCapabilityTestResponse(
          false,
          capability,
          ex.getMessage(),
          runtime.model(),
          latencyMs,
          runtime.baseUrl(),
          null,
          null,
          null
      );
    }
  }

  private boolean isConfigured(AiProviderSettingsService.RuntimeResolution runtime, AiRequestKind requestKind) {
    if (runtime == null || !runtime.hasApiKey() || runtime.model() == null || runtime.model().isBlank()) {
      aiRequestAnalyticsService.record(
          requestKind,
          runtime == null ? AiProviderType.OPENAI_COMPATIBLE : runtime.provider(),
          runtime == null ? AiCapability.TEXT : runtime.capability(),
          runtime == null ? "OPENAI_COMPATIBLE:unconfigured" : runtime.analyticsModelKey(),
          false,
          "AI runtime is not configured",
          0L
      );
      return false;
    }
    return true;
  }

  private AdminOpenAiCompatibleCapabilityTestResponse configurationFailure(AiProviderSettingsService.RuntimeResolution runtime,
                                                                           String capability,
                                                                           Boolean jsonValid,
                                                                           Boolean visionSupported) {
    return new AdminOpenAiCompatibleCapabilityTestResponse(
        false,
        capability,
        "AI runtime is not configured",
        runtime == null ? null : runtime.model(),
        0L,
        runtime == null ? null : runtime.baseUrl(),
        jsonValid,
        visionSupported,
        null
    );
  }

  private AiProviderSettingsService.RuntimeResolution runtimeFor(AdminOpenAiCompatibleTestRequest request,
                                                                 User admin,
                                                                 AiCapability capability) {
    return aiProviderSettingsService.resolveTestRuntime(
        request == null ? null : request.baseUrl(),
        request == null ? null : request.apiKey(),
        capability == AiCapability.VISION ? null : request == null ? null : request.textModel(),
        capability == AiCapability.VISION ? request == null ? null : request.visionModel() : null,
        request == null ? null : request.requestTimeoutMs(),
        request == null ? null : request.maxTokens(),
        admin,
        capability
    );
  }

  private String extractMessageContent(JsonNode payload) {
    String content = payload.path("choices").path(0).path("message").path("content").asText("").trim();
    if (!content.isEmpty()) {
      return content;
    }
    throw new OpenAiExecutionException(false, "OpenAI-compatible provider returned empty content");
  }

  private JsonNode parseJsonContent(String content) {
    if (content == null || content.isBlank()) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible provider returned empty JSON content");
    }
    try {
      String normalized = content.trim();
      if (normalized.startsWith("```") && normalized.endsWith("```")) {
        String stripped = normalized.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        normalized = stripped.trim();
      }
      return objectMapper.readTree(normalized);
    } catch (Exception ex) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible provider returned invalid JSON", ex);
    }
  }

  private String preview(String content) {
    if (content == null || content.isBlank()) {
      return null;
    }
    String trimmed = content.trim();
    return trimmed.length() <= 240 ? trimmed : trimmed.substring(0, 240);
  }

  private long elapsedMs(long startedAt) {
    return Math.max(1L, System.nanoTime() - startedAt) / 1_000_000L;
  }
}
