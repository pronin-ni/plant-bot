package com.example.plantbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenAiExecutionService {
  private final RestTemplateBuilder restTemplateBuilder;

  @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
  private String baseUrl;

  @Value("${openai.request-timeout-ms:15000}")
  private int requestTimeoutMs;

  @Value("${openai.max-tokens:256}")
  private int defaultMaxTokens;

  @Value("${openai.retry-count:2}")
  private int retryCount;

  @Value("${openai.retry-base-delay-ms:600}")
  private int retryBaseDelayMs;

  @Value("${openai.retry-max-delay-ms:4000}")
  private int retryMaxDelayMs;

  public JsonNode executeChatCompletion(
      String apiKey,
      String baseUrlOverride,
      String modelName,
      Integer requestTimeoutOverrideMs,
      Integer maxTokens,
      List<Map<String, Object>> messages
  ) {
    if (apiKey == null || apiKey.isBlank()) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible API key не настроен");
    }
    if (modelName == null || modelName.isBlank()) {
      throw new OpenAiExecutionException(false, "Модель OpenAI-compatible не выбрана");
    }

    OpenAiExecutionException lastFailure = null;
    for (int attempt = 0; attempt <= Math.max(0, retryCount); attempt += 1) {
      try {
        return doExecute(apiKey, baseUrlOverride, modelName, requestTimeoutOverrideMs, maxTokens, messages);
      } catch (OpenAiExecutionException ex) {
        lastFailure = ex;
        if (!ex.isRetryable() || attempt >= Math.max(0, retryCount)) {
          throw ex;
        }
        sleepBeforeRetry(delayForAttempt(retryBaseDelayMs, retryMaxDelayMs, attempt));
      }
    }

    if (lastFailure != null) {
      throw lastFailure;
    }
    throw new OpenAiExecutionException(false, "OpenAI-compatible request failed unexpectedly");
  }

  private JsonNode doExecute(String apiKey,
                             String baseUrlOverride,
                             String modelName,
                             Integer requestTimeoutOverrideMs,
                             Integer maxTokens,
                             List<Map<String, Object>> messages) {
    int effectiveTimeoutMs = requestTimeoutOverrideMs == null ? requestTimeoutMs : requestTimeoutOverrideMs;
    RestTemplate restTemplate = restTemplateBuilder
        .setConnectTimeout(Duration.ofMillis(Math.max(1_000, Math.min(5_000, effectiveTimeoutMs))))
        .setReadTimeout(Duration.ofMillis(Math.max(1_000, effectiveTimeoutMs)))
        .build();

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(apiKey.trim());

    Map<String, Object> request = Map.of(
        "model", modelName,
        "temperature", 0,
        "max_tokens", normalizeMaxTokens(maxTokens),
        "messages", messages
    );

    try {
      ResponseEntity<JsonNode> response = restTemplate.postForEntity(
          resolveBaseUrl(baseUrlOverride),
          new HttpEntity<>(request, headers),
          JsonNode.class
      );
      if (response.getBody() == null) {
        throw new OpenAiExecutionException(true, "OpenAI-compatible provider returned empty response");
      }
      return response.getBody();
    } catch (HttpStatusCodeException ex) {
      throw classifyHttpFailure(ex);
    } catch (ResourceAccessException ex) {
      throw classifyResourceFailure(ex);
    } catch (OpenAiExecutionException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new OpenAiExecutionException(true, "OpenAI-compatible request failed: " + safeMessage(ex), ex);
    }
  }

  private OpenAiExecutionException classifyHttpFailure(HttpStatusCodeException ex) {
    int code = ex.getStatusCode().value();
    if (code == 401 || code == 403) {
      return new OpenAiExecutionException(false, "OpenAI-compatible endpoint rejected API key or model access", ex);
    }
    if (code == 404) {
      return new OpenAiExecutionException(false, "Selected OpenAI-compatible model or path is unavailable", ex);
    }
    if (code == 429) {
      return new OpenAiExecutionException(true, "OpenAI-compatible endpoint returned rate limit", ex);
    }
    if (code >= 500) {
      return new OpenAiExecutionException(true, "OpenAI-compatible endpoint temporarily returned HTTP " + code, ex);
    }
    return new OpenAiExecutionException(false, "OpenAI-compatible endpoint returned HTTP " + code, ex);
  }

  private OpenAiExecutionException classifyResourceFailure(ResourceAccessException ex) {
    String lower = safeMessage(ex).toLowerCase();
    if (lower.contains("timed out") || lower.contains("timeout")) {
      return new OpenAiExecutionException(true, "OpenAI-compatible endpoint timed out", ex);
    }
    return new OpenAiExecutionException(true, "Network failure while contacting OpenAI-compatible endpoint", ex);
  }

  private int delayForAttempt(int baseDelayMs, int maxDelayMs, int attempt) {
    long exponential = (long) Math.max(100, baseDelayMs) * (1L << Math.max(0, attempt));
    int capped = (int) Math.min(Math.max(Math.max(100, baseDelayMs), exponential), Math.max(200, maxDelayMs));
    int jitter = ThreadLocalRandom.current().nextInt(Math.max(25, capped / 5));
    return Math.min(Math.max(200, maxDelayMs), capped + jitter);
  }

  private void sleepBeforeRetry(int delayMs) {
    try {
      Thread.sleep(Math.max(50, delayMs));
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new OpenAiExecutionException(false, "OpenAI-compatible retry interrupted", ex);
    }
  }

  private String safeMessage(Exception ex) {
    return ex == null || ex.getMessage() == null ? "unknown" : ex.getMessage();
  }

  private String resolveBaseUrl(String baseUrlOverride) {
    String value = baseUrlOverride == null || baseUrlOverride.isBlank() ? baseUrl : baseUrlOverride;
    String trimmed = value.trim();
    String normalized = trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    try {
      URI uri = URI.create(normalized);
      String scheme = uri.getScheme();
      if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
        throw new OpenAiExecutionException(false, "OpenAI-compatible base URL must use http or https");
      }
      return normalized;
    } catch (IllegalArgumentException ex) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible base URL is invalid", ex);
    }
  }

  private int normalizeMaxTokens(Integer value) {
    int normalized = value == null ? defaultMaxTokens : value;
    return Math.max(1, Math.min(32_000, normalized));
  }
}
