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
import java.util.LinkedHashMap;
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
        log.warn(
            "OpenAI-compatible request failed: model='{}' baseUrl='{}' attempt={}/{} retryable={} reason={}",
            modelName,
            resolveBaseUrl(baseUrlOverride),
            attempt + 1,
            Math.max(1, retryCount + 1),
            ex.isRetryable(),
            ex.getMessage()
        );
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

    boolean prefersJsonResponse = shouldRequestJsonResponse(messages);
    Map<String, Object> request = buildRequest(modelName, maxTokens, messages, prefersJsonResponse);

    try {
      ResponseEntity<JsonNode> response = restTemplate.postForEntity(
          resolveBaseUrl(baseUrlOverride),
          new HttpEntity<>(request, headers),
          JsonNode.class
      );
      if (response.getBody() == null) {
        throw new OpenAiExecutionException(true, "OpenAI-compatible provider returned empty response");
      }
      String providerError = extractProviderError(response.getBody());
      if (providerError != null) {
        throw new OpenAiExecutionException(false, providerError);
      }
      return response.getBody();
    } catch (HttpStatusCodeException ex) {
      if (prefersJsonResponse && ex.getStatusCode().value() == 400) {
        try {
          ResponseEntity<JsonNode> fallbackResponse = restTemplate.postForEntity(
              resolveBaseUrl(baseUrlOverride),
              new HttpEntity<>(buildRequest(modelName, maxTokens, messages, false), headers),
              JsonNode.class
          );
          if (fallbackResponse.getBody() == null) {
            throw new OpenAiExecutionException(true, "OpenAI-compatible provider returned empty response");
          }
          String providerError = extractProviderError(fallbackResponse.getBody());
          if (providerError != null) {
            throw new OpenAiExecutionException(false, providerError);
          }
          return fallbackResponse.getBody();
        } catch (HttpStatusCodeException retryEx) {
          throw classifyHttpFailure(retryEx);
        }
      }
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

  private String extractProviderError(JsonNode payload) {
    if (payload == null || payload.isMissingNode()) {
      return null;
    }
    JsonNode error = payload.path("error");
    if (error.isMissingNode() || error.isNull()) {
      return null;
    }
    String message = error.isTextual() ? error.asText("") : error.path("message").asText("");
    if (message == null || message.isBlank()) {
      return "OpenAI-compatible provider returned an error payload";
    }
    return "OpenAI-compatible provider error: " + message.trim();
  }

  private String resolveBaseUrl(String baseUrlOverride) {
    String value = baseUrlOverride == null || baseUrlOverride.isBlank() ? baseUrl : baseUrlOverride;
    String trimmed = normalizeBaseUrl(value.trim());
    try {
      URI uri = URI.create(trimmed);
      String scheme = uri.getScheme();
      if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
        throw new OpenAiExecutionException(false, "OpenAI-compatible base URL must use http or https");
      }
      if (uri.getHost() == null || uri.getHost().isBlank()) {
        throw new OpenAiExecutionException(false, "OpenAI-compatible base URL must include a host");
      }
      return trimmed;
    } catch (IllegalArgumentException ex) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible base URL is invalid", ex);
    }
  }

  private String normalizeBaseUrl(String value) {
    String normalized = value.replaceFirst("^(https?):(?=[^/])", "$1://");
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    try {
      URI uri = URI.create(normalized);
      String path = uri.getPath();
      if (path == null || path.isBlank() || "/".equals(path)) {
        path = "/v1/chat/completions";
      } else if ("/v1".equals(path)) {
        path = "/v1/chat/completions";
      } else if (path.endsWith("/chat/completios")) {
        path = path.substring(0, path.length() - 1) + "ns";
      }
      return new URI(
          uri.getScheme(),
          uri.getUserInfo(),
          uri.getHost(),
          uri.getPort(),
          path,
          uri.getQuery(),
          uri.getFragment()
      ).toString();
    } catch (Exception ex) {
      return normalized;
    }
  }

  private Map<String, Object> buildRequest(String modelName,
                                           Integer maxTokens,
                                           List<Map<String, Object>> messages,
                                           boolean prefersJsonResponse) {
    Map<String, Object> request = new LinkedHashMap<>();
    request.put("model", modelName);
    request.put("temperature", 0);
    request.put("max_tokens", normalizeMaxTokens(maxTokens));
    request.put("messages", messages);
    if (prefersJsonResponse) {
      request.put("response_format", Map.of("type", "json_object"));
    }
    return request;
  }

  private boolean shouldRequestJsonResponse(List<Map<String, Object>> messages) {
    if (messages == null || messages.isEmpty()) {
      return false;
    }
    String prompt = messages.stream()
        .map(message -> stringifyContent(message == null ? null : message.get("content")))
        .filter(value -> value != null && !value.isBlank())
        .reduce("", (left, right) -> left + "\n" + right)
        .toLowerCase();
    if (prompt.isBlank()) {
      return false;
    }
    return prompt.contains("json")
        && (prompt.contains("valid") || prompt.contains("strict") || prompt.contains("валид") || prompt.contains("только"));
  }

  @SuppressWarnings("unchecked")
  private String stringifyContent(Object content) {
    if (content == null) {
      return "";
    }
    if (content instanceof String text) {
      return text;
    }
    if (content instanceof List<?> list) {
      return list.stream()
          .map(item -> {
            if (item instanceof Map<?, ?> map) {
              Object text = map.get("text");
              return text == null ? "" : String.valueOf(text);
            }
            return String.valueOf(item);
          })
          .reduce("", (left, right) -> left + "\n" + right);
    }
    return String.valueOf(content);
  }

  private int normalizeMaxTokens(Integer value) {
    int normalized = value == null ? defaultMaxTokens : value;
    return Math.max(1, Math.min(32_000, normalized));
  }
}
