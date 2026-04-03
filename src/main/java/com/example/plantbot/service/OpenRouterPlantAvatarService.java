package com.example.plantbot.service;

import com.example.plantbot.domain.PlantAvatarSource;
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

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterPlantAvatarService {
  private static final Pattern FENCED_JSON_PATTERN = Pattern.compile("(?s)^```(?:json)?\\s*(.*?)\\s*```$");
  private static final Set<String> TEMPLATES = Set.of("rosette", "upright", "trailing", "succulent", "cane");
  private static final Set<String> LEAF_SHAPES = Set.of("oval", "lance", "heart", "split", "needle", "paddle");
  private static final Set<String> LEAF_DENSITIES = Set.of("sparse", "medium", "lush");
  private static final Set<String> PALETTES = Set.of("emerald", "moss", "sage", "jade", "olive", "variegated");
  private static final Set<String> ACCENTS = Set.of("none", "bloom", "stripe", "vein");
  private static final Set<String> POT_STYLES = Set.of("ceramic", "clay", "glass", "stone");
  private static final Set<String> BACKGROUND_TONES = Set.of("mist", "warm", "dusk", "light");

  private final ObjectMapper objectMapper;
  private final RestTemplate restTemplate;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;
  private final OpenRouterModelCatalogService openRouterModelCatalogService;

  @Value("${openrouter.model-plant:}")
  private String plantModel;

  @Value("${openrouter.model-chat:}")
  private String chatModel;

  @Value("${openrouter.model:}")
  private String fallbackModel;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String baseUrl;

  @Value("${openrouter.site-url:}")
  private String siteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String appName;

  public AvatarGenerationResult generateSpec(String exactPlantName) {
    String apiKey = openRouterUserSettingsService.resolveApiKey(null);
    if (apiKey == null || apiKey.isBlank()) {
      return AvatarGenerationResult.unavailable();
    }

    for (String modelName : resolveTextModelCandidates()) {
      try {
        JsonNode payload = callOpenRouter(apiKey, modelName, exactPlantName);
        String content = payload.path("choices").path(0).path("message").path("content").asText("").trim();
        if (content.isEmpty()) {
          continue;
        }
        PlantAvatarSpec spec = parseAndValidate(content);
        return new AvatarGenerationResult(spec, PlantAvatarSource.AI, modelName, true);
      } catch (Exception ex) {
        log.warn("Plant avatar OpenRouter generation failed for model='{}', name='{}': {}", modelName, exactPlantName, ex.getMessage());
      }
    }
    return AvatarGenerationResult.unavailable();
  }

  private JsonNode callOpenRouter(String apiKey, String modelName, String exactPlantName) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(apiKey);
    if (siteUrl != null && !siteUrl.isBlank()) {
      headers.set("HTTP-Referer", siteUrl);
    }
    if (appName != null && !appName.isBlank()) {
      headers.set("X-Title", appName);
    }
    Map<String, Object> requestBody = Map.of(
        "model", modelName,
        "temperature", 0,
        "messages", List.of(
            Map.of("role", "system", "content", systemPrompt()),
            Map.of("role", "user", "content", userPrompt(exactPlantName))
        )
    );
    ResponseEntity<JsonNode> response = restTemplate.postForEntity(
        baseUrl,
        new HttpEntity<>(requestBody, headers),
        JsonNode.class
    );
    if (response.getBody() == null) {
      throw new IllegalStateException("OpenRouter avatar response body is empty");
    }
    return response.getBody();
  }

  private PlantAvatarSpec parseAndValidate(String content) throws Exception {
    String sanitized = sanitizeJsonPayload(content);
    JsonNode root = objectMapper.readTree(sanitized);
    return new PlantAvatarSpec(
        validateEnum(root, "template", TEMPLATES),
        validateEnum(root, "leafShape", LEAF_SHAPES),
        validateEnum(root, "leafDensity", LEAF_DENSITIES),
        validateEnum(root, "palette", PALETTES),
        validateEnum(root, "accent", ACCENTS),
        validateEnum(root, "potStyle", POT_STYLES),
        validateEnum(root, "backgroundTone", BACKGROUND_TONES)
    );
  }

  private String validateEnum(JsonNode root, String field, Set<String> allowedValues) {
    String value = root.path(field).asText("").trim().toLowerCase();
    if (!allowedValues.contains(value)) {
      throw new IllegalStateException("Invalid plant avatar field: " + field + "='" + value + "'");
    }
    return value;
  }

  private String sanitizeJsonPayload(String content) {
    String trimmed = content == null ? "" : content.trim();
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

  private List<String> resolveTextModelCandidates() {
    LinkedHashSet<String> candidates = new LinkedHashSet<>();
    addCandidate(candidates, openRouterUserSettingsService.resolveGlobalModels().chatModel());
    addCandidate(candidates, chatModel);
    addCandidate(candidates, plantModel);
    addCandidate(candidates, fallbackModel);
    addCandidate(candidates, openRouterModelCatalogService.resolveConfiguredTextFallback());
    return new ArrayList<>(candidates);
  }

  private void addCandidate(Set<String> candidates, String raw) {
    if (raw == null || raw.isBlank()) {
      return;
    }
    String cleaned = raw.trim().split(",")[0].trim().split("\\s+")[0].trim();
    if (!cleaned.isBlank()) {
      candidates.add(cleaned);
    }
  }

  private String systemPrompt() {
    return """
        You design compact premium botanical app avatars.
        Return ONLY valid JSON. No markdown. No explanations.
        Choose exactly one value for each field from the allowed enums.
        Schema:
        {
          "template": "rosette|upright|trailing|succulent|cane",
          "leafShape": "oval|lance|heart|split|needle|paddle",
          "leafDensity": "sparse|medium|lush",
          "palette": "emerald|moss|sage|jade|olive|variegated",
          "accent": "none|bloom|stripe|vein",
          "potStyle": "ceramic|clay|glass|stone",
          "backgroundTone": "mist|warm|dusk|light"
        }
        Rules:
        - Think of a premium botanical mini-illustration, readable at small app-avatar sizes.
        - Keep the result plausible for the exact plant name.
        - If uncertain, still choose the closest plausible combination.
        - Return strict JSON only.
        """;
  }

  private String userPrompt(String exactPlantName) {
    return "Plant name: " + exactPlantName;
  }

  public record AvatarGenerationResult(
      PlantAvatarSpec spec,
      PlantAvatarSource source,
      String modelName,
      boolean available
  ) {
    static AvatarGenerationResult unavailable() {
      return new AvatarGenerationResult(null, null, null, false);
    }
  }
}
