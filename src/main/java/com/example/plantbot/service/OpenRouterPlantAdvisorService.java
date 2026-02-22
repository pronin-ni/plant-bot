package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.util.PlantCareAdvice;
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
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterPlantAdvisorService {
  private static final Pattern FENCED_JSON_PATTERN = Pattern.compile("(?s)^```(?:json)?\\s*(.*?)\\s*```$");
  private static final Pattern LATIN_TEXT_PATTERN = Pattern.compile("[A-Za-z]");
  private static final Pattern CYRILLIC_TEXT_PATTERN = Pattern.compile("[А-Яа-яЁё]");

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;
  private final ConcurrentMap<String, CachedCareAdvice> careAdviceCache = new ConcurrentHashMap<>();

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

  @Value("${openrouter.care-cache-ttl-minutes:10080}")
  private int careCacheTtlMinutes;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) {
      return Optional.empty();
    }
    try {
      JsonNode body = postMessages(List.of(
          Map.of("role", "system", "content", intervalSystemPrompt()),
          Map.of("role", "user", "content", userPrompt(plantName))
      ));
      if (body == null) {
        return Optional.empty();
      }

      String content = extractContent(body);
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
      log.info("OpenRouter interval success. input='{}', normalized='{}', interval={}, type={}, rawPreview='{}'",
          plantName, normalizedName, interval, suggestedType, preview(content));
      return Optional.of(new PlantLookupResult(normalizedName, interval, source, suggestedType));
    } catch (Exception ex) {
      log.warn("OpenRouter suggestion failed for '{}': {}", plantName, ex.getMessage());
      return Optional.empty();
    }
  }

  public Optional<PlantCareAdvice> suggestCareAdvice(Plant plant, double recommendedIntervalDays) {
    if (plant == null || plant.getName() == null || plant.getName().isBlank()) {
      return Optional.empty();
    }
    if (apiKey == null || apiKey.isBlank() || model == null || model.isBlank()) {
      return Optional.empty();
    }

    String cacheKey = buildCareCacheKey(plant, recommendedIntervalDays);
    Optional<PlantCareAdvice> cached = getCareAdviceCache(cacheKey);
    if (cached != null) {
      return cached;
    }

    try {
      JsonNode body = postMessages(List.of(
          Map.of("role", "system", "content", careAdviceSystemPrompt()),
          Map.of("role", "user", "content", careAdviceUserPrompt(plant, recommendedIntervalDays))
      ));
      if (body == null) {
        putCareAdviceCache(cacheKey, Optional.empty());
        return Optional.empty();
      }

      String content = extractContent(body);
      if (content.isEmpty()) {
        putCareAdviceCache(cacheKey, Optional.empty());
        return Optional.empty();
      }

      String jsonPayload = sanitizeJsonPayload(content);
      JsonNode advice = objectMapper.readTree(jsonPayload);

      int cycle = advice.path("watering_cycle_days").asInt((int) Math.round(recommendedIntervalDays));
      cycle = Math.max(1, Math.min(30, cycle));

      List<String> additives = new ArrayList<>();
      JsonNode additivesNode = advice.path("additives");
      if (additivesNode.isArray()) {
        for (JsonNode node : additivesNode) {
          String value = node.asText("").trim();
          if (!value.isEmpty()) {
            additives.add(value);
          }
          if (additives.size() >= 3) {
            break;
          }
        }
      }

      String soilType = normalizeAdviceNote(advice.path("soil_type").asText("").trim());
      List<String> soilComposition = new ArrayList<>();
      JsonNode soilCompositionNode = advice.path("soil_composition");
      if (soilCompositionNode.isArray()) {
        for (JsonNode node : soilCompositionNode) {
          String value = normalizeAdviceNote(node.asText("").trim());
          if (!value.isEmpty()) {
            soilComposition.add(value);
          }
          if (soilComposition.size() >= 5) {
            break;
          }
        }
      }

      String note = normalizeAdviceNote(advice.path("note").asText("").trim());
      PlantCareAdvice result = new PlantCareAdvice(cycle, additives, soilType, soilComposition, note, "OpenRouter:" + model);
      putCareAdviceCache(cacheKey, Optional.of(result));
      log.info("OpenRouter care advice success. plant='{}', cycle={}, additives={}, soilType='{}', soilComposition={}, source='{}'",
          plant.getName(), cycle, additives, soilType, soilComposition, result.source());
      return Optional.of(result);
    } catch (Exception ex) {
      putCareAdviceCache(cacheKey, Optional.empty());
      log.warn("OpenRouter care advice failed for '{}': {}", plant.getName(), ex.getMessage());
      return Optional.empty();
    }
  }

  private JsonNode postMessages(List<Map<String, Object>> messages) {
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
        "messages", messages
    );

    ResponseEntity<JsonNode> response = restTemplate.postForEntity(
        baseUrl,
        new HttpEntity<>(request, headers),
        JsonNode.class
    );
    return response.getBody();
  }

  private String extractContent(JsonNode body) {
    return body.path("choices").path(0).path("message").path("content").asText("").trim();
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

  private String intervalSystemPrompt() {
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

  private String careAdviceSystemPrompt() {
    return """
        You are a careful houseplant assistant.
        Return ONLY valid JSON (no markdown, no prose) with this schema:
        {
          "watering_cycle_days": 1,
          "additives": ["string"],
          "soil_type": "string",
          "soil_composition": ["string"],
          "note": "string"
        }
        Rules:
        - watering_cycle_days must be integer in [1..30]
        - additives: 0..3 short items suitable for the next watering (e.g., seaweed extract, calcium-magnesium)
        - soil_type: short string with recommended soil type in Russian
        - soil_composition: 2..5 short components in Russian (e.g., торф, перлит, кора)
        - if additives are unsafe or not needed, return empty array
        - note should be short and practical (max 120 chars)
        - IMPORTANT: additives, soil_type, soil_composition and note must be in Russian
        """;
  }

  private String careAdviceUserPrompt(Plant plant, double recommendedIntervalDays) {
    return """
        Название растения: %s
        Тип растения: %s
        Объем горшка (л): %.2f
        Текущий рекомендуемый интервал (дни): %.1f
        Цель: предложи практичный цикл следующего полива и необязательные безопасные добавки.
        Ответ должен быть на русском языке.
        """.formatted(plant.getName(), plant.getType().name(), plant.getPotVolumeLiters(), recommendedIntervalDays);
  }


  private String normalizeAdviceNote(String note) {
    if (note == null || note.isBlank()) {
      return "";
    }
    // If model returned note only in Latin script, hide it to avoid mixed-language UX.
    if (LATIN_TEXT_PATTERN.matcher(note).find() && !CYRILLIC_TEXT_PATTERN.matcher(note).find()) {
      return "";
    }
    return note;
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

  private String buildCareCacheKey(Plant plant, double recommendedIntervalDays) {
    return (plant.getName().trim().toLowerCase() + "|"
        + plant.getType().name() + "|"
        + plant.getPotVolumeLiters() + "|"
        + Math.round(recommendedIntervalDays * 10.0) / 10.0);
  }

  private Optional<PlantCareAdvice> getCareAdviceCache(String key) {
    CachedCareAdvice row = careAdviceCache.get(key);
    if (row == null) {
      return null;
    }
    if (row.expiresAt().isBefore(Instant.now())) {
      careAdviceCache.remove(key);
      return null;
    }
    return row.value();
  }

  private void putCareAdviceCache(String key, Optional<PlantCareAdvice> value) {
    long ttlSeconds = Math.max(1, careCacheTtlMinutes) * 60L;
    careAdviceCache.put(key, new CachedCareAdvice(value, Instant.now().plusSeconds(ttlSeconds)));
  }

  private record CachedCareAdvice(Optional<PlantCareAdvice> value, Instant expiresAt) {
  }
}
