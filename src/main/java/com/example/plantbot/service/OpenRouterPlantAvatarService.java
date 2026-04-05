package com.example.plantbot.service;

import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.domain.PlantAvatarSource;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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
  private final AiProviderSettingsService aiProviderSettingsService;
  private final AiExecutionService aiExecutionService;

  public AvatarGenerationResult generateSpec(String exactPlantName) {
    AiProviderSettingsService.RuntimeResolution runtime = aiProviderSettingsService.resolveTextRuntime(null);
    if (!runtime.hasApiKey()) {
      return AvatarGenerationResult.unavailable();
    }

    try {
      JsonNode payload = callProvider(runtime, exactPlantName);
      String content = AiResponseContentExtractor.extractTextContent(payload);
      if (content.isEmpty()) {
        return AvatarGenerationResult.unavailable();
      }
      PlantAvatarSpec spec = parseAndValidate(content);
      return new AvatarGenerationResult(spec, PlantAvatarSource.AI, runtime.sourceLabel(), true);
    } catch (Exception ex) {
      log.warn("Plant avatar AI generation failed for provider={} model='{}', name='{}': {}",
          runtime.provider(), runtime.model(), exactPlantName, ex.getMessage());
    }
    return AvatarGenerationResult.unavailable();
  }

  private JsonNode callProvider(AiProviderSettingsService.RuntimeResolution runtime, String exactPlantName) {
    return aiExecutionService.execute(
        runtime,
        AiRequestKind.AVATAR_SPEC,
        List.of(
            Map.of("role", "system", "content", systemPrompt()),
            Map.of("role", "user", "content", userPrompt(exactPlantName))
        )
    ).body();
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
