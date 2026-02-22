package com.example.plantbot.service;

import com.example.plantbot.domain.PlantType;
import com.example.plantbot.util.PlantLookupResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterPlantAdvisorService {
  private static final Pattern FENCED_JSON_PATTERN = Pattern.compile("(?s)^```(?:json)?\\s*(.*?)\\s*```$");

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;

  @Value("${openrouter.api-key:}")
  private String apiKey;

  @Value("${openrouter.model:}")
  private String model;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String baseUrl;

  @Value("${openrouter.site-url:}")
  private String siteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String appName;

  @Value("${openrouter.backoff-minutes:60}")
  private long backoffMinutes;

  private volatile Instant backoffUntil = Instant.EPOCH;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) {
      return Optional.empty();
    }
    if (backoffUntil.isAfter(Instant.now())) {
      log.info("OpenRouter skipped due to backoff until {}", backoffUntil);
      return Optional.empty();
    }
    try {
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
          "model", model,
          "temperature", 0,
          "messages", List.of(
              Map.of("role", "system", "content", systemPrompt()),
              Map.of("role", "user", "content", userPrompt(plantName))
          )
      );

      ResponseEntity<JsonNode> response = restTemplate.postForEntity(
          baseUrl,
          new HttpEntity<>(request, headers),
          JsonNode.class
      );
      JsonNode body = response.getBody();
      if (body == null) {
        return Optional.empty();
      }

      String content = body.path("choices").path(0).path("message").path("content").asText("").trim();
      if (content.isEmpty()) {
        return Optional.empty();
      }

      String jsonPayload = sanitizeJsonPayload(content);
      if (jsonPayload.isEmpty()) {
        log.warn("OpenRouter returned empty payload after sanitization. input='{}', rawPreview='{}'",
            plantName, preview(content));
        return Optional.empty();
      }

      JsonNode advice = objectMapper.readTree(jsonPayload);
      int interval = advice.path("interval_days").asInt(0);
      if (interval <= 0) {
        return Optional.empty();
      }
      interval = Math.max(1, Math.min(30, interval));

      String normalizedName = advice.path("normalized_name").asText(plantName).trim();
      if (normalizedName.isEmpty()) {
        normalizedName = plantName;
      }

      PlantType suggestedType = parsePlantType(advice.path("type_hint").asText(""));
      String source = "OpenRouter:" + model;
      log.info("OpenRouter suggestion success. input='{}', normalized='{}', interval={}, type={}, rawPreview='{}'",
          plantName, normalizedName, interval, suggestedType, preview(content));
      return Optional.of(new PlantLookupResult(normalizedName, interval, source, suggestedType));
    } catch (HttpStatusCodeException ex) {
      String body = ex.getResponseBodyAsString();
      if (ex.getStatusCode().value() == 404 && body != null && body.contains("data policy")) {
        activateBackoff();
        log.warn("OpenRouter disabled temporarily by data policy for model='{}'. "
            + "Use paid model or enable free model publication in https://openrouter.ai/settings/privacy. "
            + "status={} body={}", model, ex.getStatusCode(), body);
        return Optional.empty();
      }
      if (ex.getStatusCode().value() == 429 || ex.getStatusCode().is5xxServerError()) {
        activateBackoff();
      }
      log.warn("OpenRouter HTTP failure for '{}': {} {}", plantName, ex.getStatusCode(), body);
      return Optional.empty();
    } catch (Exception ex) {
      log.warn("OpenRouter suggestion failed for '{}': {}", plantName, ex.getMessage());
      return Optional.empty();
    }
  }

  private String sanitizeJsonPayload(String content) {
    String trimmed = content == null ? "" : content.trim();
    if (trimmed.isEmpty()) {
      return "";
    }

    Matcher fenced = FENCED_JSON_PATTERN.matcher(trimmed);
    if (fenced.matches()) {
      trimmed = fenced.group(1).trim();
    }

    int firstBrace = trimmed.indexOf('{');
    int lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.substring(firstBrace, lastBrace + 1).trim();
    }
    return trimmed;
  }

  private String preview(String value) {
    if (value == null) {
      return "";
    }
    String oneLine = value.replace("\n", "\\n").replace("\r", "");
    return oneLine.length() <= 220 ? oneLine : oneLine.substring(0, 220) + "...";
  }

  // Prompt is strict JSON contract to keep parsing deterministic.
  private String systemPrompt() {
    return """
        You are a plant-care assistant.
        Task: estimate watering interval in days for ONE houseplant name.
        Return ONLY valid JSON (no markdown, no prose) with this exact schema:
        {
          "normalized_name": "string",
          "interval_days": 1,
          "type_hint": "SUCCULENT|TROPICAL|FERN|DEFAULT",
          "confidence": 0.0
        }
        Rules:
        - interval_days must be integer in [1..30]
        - confidence must be number in [0..1]
        - if uncertain, choose DEFAULT and a conservative interval_days
        """;
  }

  private String userPrompt(String plantName) {
    return "Plant name: " + plantName;
  }

  private PlantType parsePlantType(String value) {
    if (value == null || value.isBlank()) {
      return PlantType.DEFAULT;
    }
    try {
      return PlantType.valueOf(value.trim().toUpperCase());
    } catch (Exception ignored) {
      return PlantType.DEFAULT;
    }
  }

  private void activateBackoff() {
    long minutes = Math.max(1, backoffMinutes);
    backoffUntil = Instant.now().plusSeconds(minutes * 60L);
  }
}
