package com.example.plantbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterExecutionService {
  private final RestTemplateBuilder restTemplateBuilder;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelHealthService openRouterModelHealthService;
  private final PerformanceMetricsService performanceMetricsService;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String defaultBaseUrl;

  @Value("${openrouter.site-url:}")
  private String defaultSiteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String defaultAppName;

  public JsonNode executeChatCompletion(
      String apiKey,
      String modelName,
      OpenRouterModelKind kind,
      String baseUrl,
      String siteUrl,
      String appName,
      List<Map<String, Object>> messages
  ) {
    if (apiKey == null || apiKey.isBlank()) {
      throw new OpenRouterExecutionException(OpenRouterFailureType.INVALID_KEY, false, "OpenRouter API key не настроен");
    }
    if (modelName == null || modelName.isBlank()) {
      throw new OpenRouterExecutionException(OpenRouterFailureType.MODEL_UNAVAILABLE, false, "Модель OpenRouter не выбрана");
    }
    if (!openRouterModelHealthService.shouldAllowRequest(kind, modelName)) {
      throw new OpenRouterExecutionException(
          OpenRouterFailureType.CIRCUIT_OPEN,
          false,
          "Модель временно отключена после повторяющихся ошибок; ожидаем окно восстановления"
      );
    }

    int retryCount = openRouterGlobalSettingsService.resolveRetryCount();
    int baseDelayMs = openRouterGlobalSettingsService.resolveRetryBaseDelayMs();
    int maxDelayMs = openRouterGlobalSettingsService.resolveRetryMaxDelayMs();
    OpenRouterExecutionException lastFailure = null;

    for (int attempt = 0; attempt <= retryCount; attempt += 1) {
      long startedAt = System.nanoTime();
      try {
        JsonNode body = doExecute(
            apiKey,
            modelName,
            normalizeBaseUrl(baseUrl),
            normalizeHeaderValue(siteUrl, defaultSiteUrl),
            normalizeHeaderValue(appName, defaultAppName),
            messages
        );
        if (body == null) {
          throw new OpenRouterExecutionException(OpenRouterFailureType.MALFORMED_RESPONSE, true, "OpenRouter вернул пустой ответ");
        }
        performanceMetricsService.recordExternalCall("openrouter", "chat_completions", modelName, attempt == 0 ? "success" : "success_after_retry", System.nanoTime() - startedAt);
        openRouterModelHealthService.recordSuccess(kind, modelName);
        return body;
      } catch (OpenRouterExecutionException ex) {
        lastFailure = ex;
        performanceMetricsService.recordExternalCall("openrouter", "chat_completions", modelName, attemptOutcome(ex, attempt, retryCount), System.nanoTime() - startedAt);
        performanceMetricsService.incrementExternalFailure("openrouter", "chat_completions", ex.getFailureType().name().toLowerCase());
        if (!ex.isRetryable() || attempt >= retryCount) {
          openRouterModelHealthService.recordFailure(kind, modelName, ex.getFailureType(), ex.getMessage());
          throw ex;
        }
        sleepBeforeRetry(delayForAttempt(baseDelayMs, maxDelayMs, attempt));
      }
    }

    if (lastFailure != null) {
      throw lastFailure;
    }
    throw new OpenRouterExecutionException(OpenRouterFailureType.TEMPORARY_ERROR, false, "OpenRouter request failed unexpectedly");
  }

  private JsonNode doExecute(
      String apiKey,
      String modelName,
      String baseUrl,
      String siteUrl,
      String appName,
      List<Map<String, Object>> messages
  ) {
    RestTemplate restTemplate = restTemplateBuilder
        .setConnectTimeout(Duration.ofMillis(Math.max(1_000, Math.min(5_000, openRouterGlobalSettingsService.resolveRequestTimeoutMs()))))
        .setReadTimeout(Duration.ofMillis(openRouterGlobalSettingsService.resolveRequestTimeoutMs()))
        .build();

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(apiKey);
    if (siteUrl != null && !siteUrl.isBlank()) {
      headers.set("HTTP-Referer", siteUrl);
    }
    if (appName != null && !appName.isBlank()) {
      headers.set("X-Title", appName);
    }

    Map<String, Object> request = Map.of(
        "model", modelName,
        "temperature", 0,
        "messages", messages
    );

    try {
      ResponseEntity<JsonNode> response = restTemplate.postForEntity(
          baseUrl,
          new HttpEntity<>(request, headers),
          JsonNode.class
      );
      return response.getBody();
    } catch (HttpStatusCodeException ex) {
      throw classifyHttpFailure(ex);
    } catch (ResourceAccessException ex) {
      throw classifyResourceFailure(ex);
    } catch (OpenRouterExecutionException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new OpenRouterExecutionException(OpenRouterFailureType.TEMPORARY_ERROR, true, "Ошибка OpenRouter: " + safeMessage(ex), ex);
    }
  }

  private OpenRouterExecutionException classifyHttpFailure(HttpStatusCodeException ex) {
    int code = ex.getStatusCode().value();
    String body = ex.getResponseBodyAsString();
    String lower = body == null ? "" : body.toLowerCase();
    if (code == 401 || code == 403) {
      return new OpenRouterExecutionException(OpenRouterFailureType.INVALID_KEY, false, "OpenRouter отклонил API key или доступ к модели", ex);
    }
    if (code == 404 || lower.contains("provider route") || lower.contains("no endpoints") || (lower.contains("model") && lower.contains("unavailable"))) {
      return new OpenRouterExecutionException(OpenRouterFailureType.MODEL_UNAVAILABLE, false, "Выбранная модель OpenRouter недоступна", ex);
    }
    if (code == 429) {
      return new OpenRouterExecutionException(OpenRouterFailureType.RATE_LIMIT, true, "OpenRouter вернул rate limit", ex);
    }
    if (code >= 500) {
      return new OpenRouterExecutionException(OpenRouterFailureType.SERVER_ERROR, true, "OpenRouter временно вернул HTTP " + code, ex);
    }
    return new OpenRouterExecutionException(OpenRouterFailureType.TEMPORARY_ERROR, false, "OpenRouter вернул HTTP " + code, ex);
  }

  private OpenRouterExecutionException classifyResourceFailure(ResourceAccessException ex) {
    String lower = safeMessage(ex).toLowerCase();
    if (lower.contains("timed out") || lower.contains("timeout")) {
      return new OpenRouterExecutionException(OpenRouterFailureType.TIMEOUT, true, "OpenRouter не ответил вовремя", ex);
    }
    return new OpenRouterExecutionException(OpenRouterFailureType.NETWORK_ERROR, true, "Сетевой сбой при обращении к OpenRouter", ex);
  }

  private int delayForAttempt(int baseDelayMs, int maxDelayMs, int attempt) {
    long exponential = (long) baseDelayMs * (1L << Math.max(0, attempt));
    int capped = (int) Math.min(Math.max(baseDelayMs, exponential), maxDelayMs);
    int jitter = ThreadLocalRandom.current().nextInt(Math.max(25, capped / 5));
    return Math.min(maxDelayMs, capped + jitter);
  }

  private void sleepBeforeRetry(int delayMs) {
    try {
      Thread.sleep(Math.max(50, delayMs));
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new OpenRouterExecutionException(OpenRouterFailureType.TEMPORARY_ERROR, false, "OpenRouter retry interrupted", ex);
    }
  }

  private String attemptOutcome(OpenRouterExecutionException ex, int attempt, int retryCount) {
    return attempt >= retryCount ? "failed" : "retry_" + ex.getFailureType().name().toLowerCase();
  }

  private String safeMessage(Exception ex) {
    return ex == null || ex.getMessage() == null ? "unknown" : ex.getMessage();
  }

  private String normalizeBaseUrl(String value) {
    if (value != null && !value.isBlank()) {
      return value.trim();
    }
    return defaultBaseUrl;
  }

  private String normalizeHeaderValue(String value, String fallback) {
    if (value != null && !value.isBlank()) {
      return value.trim();
    }
    return fallback == null || fallback.isBlank() ? null : fallback.trim();
  }
}
