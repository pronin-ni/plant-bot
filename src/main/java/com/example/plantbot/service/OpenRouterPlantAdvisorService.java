package com.example.plantbot.service;

import com.example.plantbot.domain.OpenRouterCacheEntry;
import com.example.plantbot.repository.OpenRouterCacheRepository;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.util.AIWateringProfile;
import com.example.plantbot.util.PlantCareAdvice;
import com.example.plantbot.util.PlantLookupResult;
import com.example.plantbot.util.WeatherData;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterPlantAdvisorService {
  private static final Pattern FENCED_JSON_PATTERN = Pattern.compile("(?s)^```(?:json)?\\s*(.*?)\\s*```$");
  private static final Pattern LATIN_TEXT_PATTERN = Pattern.compile("[A-Za-z]");
  private static final Pattern CYRILLIC_TEXT_PATTERN = Pattern.compile("[А-Яа-яЁё]");
  private static final String NS_CARE = "care";
  private static final String NS_WATERING = "watering";
  private static final String NS_CHAT = "chat";

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;
  private final OpenRouterCacheRepository openRouterCacheRepository;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @Value("${openrouter.model:}")
  private String model;

  @Value("${openrouter.model-plant:}")
  private String plantModel;

  @Value("${openrouter.model-chat:}")
  private String chatModel;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String baseUrl;

  @Value("${openrouter.site-url:}")
  private String siteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String appName;

  @Value("${openrouter.care-cache-ttl-minutes:10080}")
  private int careCacheTtlMinutes;

  @Value("${openrouter.watering-cache-ttl-minutes:720}")
  private int wateringCacheTtlMinutes;

  @Value("${openrouter.chat-cache-ttl-minutes:10080}")
  private int chatCacheTtlMinutes;

  @Value("${openrouter.chat-fallback-enabled:true}")
  private boolean chatFallbackEnabled;

  @Value("${openrouter.cache-max-entries:5000}")
  private int cacheMaxEntries;

  @Value("${openrouter.cache-negative-ttl-seconds:90}")
  private int negativeCacheTtlSeconds;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    return suggestIntervalDays(null, plantName);
  }

  public Optional<PlantLookupResult> suggestIntervalDays(User user, String plantName) {
    String modelToUse = resolveTextModel(user);
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank() || modelToUse == null || modelToUse.isBlank()) {
      return Optional.empty();
    }
    try {
      JsonNode body = postMessages(apiKey, modelToUse, List.of(
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
      String source = "OpenRouter:" + modelToUse;
      log.info("OpenRouter interval success. input='{}', normalized='{}', interval={}, type={}, rawPreview='{}'",
          plantName, normalizedName, interval, suggestedType, preview(content));
      return Optional.of(new PlantLookupResult(normalizedName, interval, source, suggestedType));
    } catch (Exception ex) {
      log.warn("OpenRouter suggestion failed for '{}': {}", plantName, ex.getMessage());
      return Optional.empty();
    }
  }

  public Optional<PlantCareAdvice> suggestCareAdvice(Plant plant, double recommendedIntervalDays) {
    return suggestCareAdvice(plant, recommendedIntervalDays, false);
  }

  public Optional<PlantCareAdvice> suggestCareAdvice(Plant plant, double recommendedIntervalDays, boolean forceRefresh) {
    User user = plant == null ? null : plant.getUser();
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (plant == null || plant.getName() == null || plant.getName().isBlank()) {
      return Optional.empty();
    }
    if (apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }

    for (String modelToUse : resolveTextModelCandidates(user)) {
      String cacheKey = buildCareCacheKey(modelToUse, plant, recommendedIntervalDays);
      if (!forceRefresh) {
        Optional<PlantCareAdvice> cached = getCareAdviceCache(cacheKey);
        if (cached != null) {
          if (cached.isPresent()) {
            return cached;
          }
          continue;
        }
      }

      try {
        JsonNode body = postMessages(apiKey, modelToUse, List.of(
            Map.of("role", "system", "content", careAdviceSystemPrompt()),
            Map.of("role", "user", "content", careAdviceUserPrompt(plant, recommendedIntervalDays))
        ));
        if (body == null) {
          putCareAdviceCache(cacheKey, Optional.empty());
          continue;
        }

        String content = extractContent(body);
        if (content.isEmpty()) {
          putCareAdviceCache(cacheKey, Optional.empty());
          continue;
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
        PlantCareAdvice result = new PlantCareAdvice(cycle, additives, soilType, soilComposition, note, "OpenRouter:" + modelToUse);
        putCareAdviceCache(cacheKey, Optional.of(result));
        log.info("OpenRouter care advice success. plant='{}', cycle={}, additives={}, soilType='{}', soilComposition={}, source='{}'",
            plant.getName(), cycle, additives, soilType, soilComposition, result.source());
        return Optional.of(result);
      } catch (Exception ex) {
        putCareAdviceCache(cacheKey, Optional.empty());
        log.warn("OpenRouter care advice failed for '{}'. model='{}': {}", plant.getName(), modelToUse, ex.getMessage());
      }
    }

    return Optional.empty();
  }

  public Optional<AIWateringProfile> suggestWateringProfile(Plant plant, WeatherData weather, boolean outdoor) {
    User user = plant == null ? null : plant.getUser();
    String modelToUse = resolveTextModel(user);
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (plant == null || apiKey == null || apiKey.isBlank() || modelToUse == null || modelToUse.isBlank()) {
      return Optional.empty();
    }
    String cacheKey = buildWateringProfileCacheKey(modelToUse, plant, weather, outdoor);
    Optional<AIWateringProfile> cached = getWateringProfileCache(cacheKey);
    if (cached != null) {
      return cached;
    }
    try {
      JsonNode body = postMessages(apiKey, modelToUse, List.of(
          Map.of("role", "system", "content", wateringProfileSystemPrompt()),
          Map.of("role", "user", "content", wateringProfileUserPrompt(plant, weather, outdoor))
      ));
      if (body == null) {
        putWateringProfileCache(cacheKey, Optional.empty());
        return Optional.empty();
      }
      String content = extractContent(body);
      if (content.isEmpty()) {
        putWateringProfileCache(cacheKey, Optional.empty());
        return Optional.empty();
      }
      JsonNode profile = objectMapper.readTree(sanitizeJsonPayload(content));
      double intervalFactor = profile.path("interval_factor").asDouble(1.0);
      double waterFactor = profile.path("water_factor").asDouble(1.0);
      if (intervalFactor <= 0 || waterFactor <= 0) {
        putWateringProfileCache(cacheKey, Optional.empty());
        return Optional.empty();
      }
      intervalFactor = Math.max(0.6, Math.min(1.6, intervalFactor));
      waterFactor = Math.max(0.5, Math.min(2.0, waterFactor));
      AIWateringProfile value = new AIWateringProfile(intervalFactor, waterFactor, "OpenRouter:" + modelToUse);
      putWateringProfileCache(cacheKey, Optional.of(value));
      return Optional.of(value);
    } catch (Exception ex) {
      putWateringProfileCache(cacheKey, Optional.empty());
      log.warn("OpenRouter watering profile failed for '{}': {}", plant.getName(), ex.getMessage());
      return Optional.empty();
    }
  }

  public Optional<WizardWateringRecommendation> suggestWizardRecommendation(User user,
                                                                            String plantName,
                                                                            PlantCategory category,
                                                                            String sizeHint) {
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    String modelToUse = resolveTextModel(user);
    if (apiKey == null || apiKey.isBlank() || modelToUse == null || modelToUse.isBlank()) {
      return Optional.empty();
    }
    if (plantName == null || plantName.isBlank()) {
      return Optional.empty();
    }

    try {
      JsonNode body = postMessages(apiKey, modelToUse, List.of(
          Map.of("role", "system", "content", wizardRecommendSystemPrompt()),
          Map.of("role", "user", "content", wizardRecommendUserPrompt(plantName.trim(), category, sizeHint))
      ));
      if (body == null) {
        return Optional.empty();
      }

      String content = extractContent(body);
      if (content.isEmpty()) {
        return Optional.empty();
      }

      JsonNode json = objectMapper.readTree(sanitizeJsonPayload(content));
      int frequency = clamp(json.path("watering_frequency_days").asInt(0), 1, 60);
      int volumeMl = clamp(json.path("watering_volume_ml").asInt(0), 50, 10_000);
      if (frequency <= 0 || volumeMl <= 0) {
        return Optional.empty();
      }

      String light = normalizeAdviceNote(json.path("light").asText(""));
      String soil = normalizeAdviceNote(json.path("soil").asText(""));
      String notes = normalizeAdviceNote(json.path("notes").asText(""));
      return Optional.of(new WizardWateringRecommendation(
          frequency,
          volumeMl,
          light,
          soil,
          notes,
          "OpenRouter:" + modelToUse
      ));
    } catch (Exception ex) {
      log.warn("OpenRouter wizard recommend failed for '{}': {}", preview(plantName), ex.getMessage());
      return Optional.empty();
    }
  }

  public Optional<ChatAnswer> answerGardeningQuestion(String question) {
    return answerGardeningQuestion(null, question, null);
  }

  public Optional<ChatAnswer> answerGardeningQuestion(User user, String question) {
    return answerGardeningQuestion(user, question, null);
  }

  public Optional<ChatAnswer> answerGardeningQuestion(User user, String question, String photoBase64) {
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (question == null || question.isBlank() || apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }

    String normalizedQuestion = question.trim();
    String normalizedPhoto = normalizePhotoBase64(photoBase64);
    boolean hasPhoto = normalizedPhoto != null;
    for (String modelToUse : resolveChatModelCandidates(user, hasPhoto)) {
      String cacheKey = buildChatCacheKey(modelToUse, normalizedQuestion);
      if (!hasPhoto) {
        Optional<String> cached = getChatAnswerCache(cacheKey);
        if (cached != null) {
          log.info("OpenRouter chat cache hit. model='{}', question='{}', hasAnswer={}",
              modelToUse, preview(normalizedQuestion), cached.isPresent());
          if (cached.isPresent()) {
            return Optional.of(new ChatAnswer(cached.get(), modelToUse));
          }
          continue;
        }
      }

      try {
        JsonNode body = postMessages(apiKey, modelToUse, buildChatMessages(normalizedQuestion, normalizedPhoto));
        if (body == null) {
          continue;
        }
        String content = extractContent(body);
        if (content.isEmpty()) {
          continue;
        }
        String answer = content.trim();
        if (!hasPhoto) {
          putChatAnswerCache(cacheKey, Optional.of(answer));
        }
        log.info("OpenRouter chat success. model='{}', hasPhoto={}, question='{}', answerPreview='{}'",
            modelToUse, hasPhoto, preview(normalizedQuestion), preview(answer));
        return Optional.of(new ChatAnswer(answer, modelToUse));
      } catch (Exception ex) {
        log.warn("OpenRouter chat failed. model='{}', hasPhoto={}, question='{}': {}",
            modelToUse, hasPhoto, preview(normalizedQuestion), ex.getMessage());
      }
    }

    return Optional.empty();
  }

  private List<Map<String, Object>> buildChatMessages(String question, String photoBase64) {
    if (photoBase64 == null || photoBase64.isBlank()) {
      return List.of(
          Map.of("role", "system", "content", gardeningChatSystemPrompt()),
          Map.of("role", "user", "content", question)
      );
    }

    Map<String, Object> userContent = Map.of(
        "role", "user",
        "content", List.of(
            Map.of("type", "text", "text", question),
            Map.of("type", "image_url", "image_url", Map.of("url", photoBase64))
        )
    );

    return List.of(
        Map.of("role", "system", "content", gardeningChatSystemPrompt()),
        userContent
    );
  }

  private JsonNode postMessages(String apiKey, String modelName, List<Map<String, Object>> messages) {
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

  private int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
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
          "type_hint": "SUCCULENT|TROPICAL|FERN|CONIFER|DEFAULT",
          "confidence": 0.0
        }
        Rules:
        - interval_days must be integer in [1..30]
        - confidence must be number in [0..1]
        - if uncertain, choose DEFAULT and a conservative interval_days
        """;
  }

  private String gardeningChatSystemPrompt() {
    return """
        Ты агроном-консультант по садоводству и уходу за комнатными/уличными растениями.
        Отвечай только на русском языке, кратко и по делу.
        Формат:
        - сначала короткий вывод (1-2 предложения),
        - затем 3-7 практических шагов.
        Если вопрос не про растения/сад — вежливо скажи, что помогаешь только по теме растений.
        Не выдумывай факты: если данных мало, предложи что уточнить.
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

  private String wateringProfileSystemPrompt() {
    return """
        You are a plant watering model tuner.
        Return ONLY valid JSON (no markdown, no prose):
        {
          "interval_factor": 1.0,
          "water_factor": 1.0
        }
        Rules:
        - interval_factor in [0.6..1.6]
        - water_factor in [0.5..2.0]
        - never return 0
        """;
  }

  private String wateringProfileUserPrompt(Plant plant, WeatherData weather, boolean outdoor) {
    return """
        Дай поправочные коэффициенты полива.
        Растение: %s
        Тип: %s
        Размещение: %s
        Температура: %.1f
        Влажность: %.1f
        Осадки за час: %.1f
        """.formatted(
        plant.getName(),
        plant.getType().name(),
        outdoor ? "улица" : "дом",
        weather == null ? 20.0 : weather.temperatureC(),
        weather == null ? 50.0 : weather.humidityPercent(),
        weather == null ? 0.0 : weather.precipitationMm1h()
    );
  }


  private String wizardRecommendSystemPrompt() {
    return """
        Ты эксперт по уходу за комнатными и садовыми растениями.
        Верни только JSON без markdown и текста вне JSON:
        {
          "watering_frequency_days": 5,
          "watering_volume_ml": 300,
          "light": "полутень",
          "soil": "слабокислый",
          "notes": "короткая практическая рекомендация"
        }
        Правила:
        - watering_frequency_days: целое число [1..60]
        - watering_volume_ml: целое число [50..10000]
        - все текстовые поля на русском
        """;
  }

  private String wizardRecommendUserPrompt(String plantName, PlantCategory category, String sizeHint) {
    String categoryLabel = category == null ? "HOME" : category.name();
    return """
        Рекомендации по поливу для %s в %s.
        Категория: %s.
        Учитывай, что для OUTDOOR_GARDEN полив обычно объемнее, чем для декоративных и домашних.
        """.formatted(plantName, sizeHint == null || sizeHint.isBlank() ? "без уточненного размера" : sizeHint, categoryLabel);
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

  private String buildCareCacheKey(String modelName, Plant plant, double recommendedIntervalDays) {
    String modelKey = (modelName == null || modelName.isBlank()) ? "model:unknown" : "model:" + modelName.trim().toLowerCase();
    return (NS_CARE + "|"
        + modelKey + "|"
        + plant.getName().trim().toLowerCase() + "|"
        + plant.getType().name() + "|"
        + plant.getPotVolumeLiters() + "|"
        + Math.round(recommendedIntervalDays * 10.0) / 10.0);
  }

  private String buildWateringProfileCacheKey(String modelName, Plant plant, WeatherData weather, boolean outdoor) {
    String modelKey = (modelName == null || modelName.isBlank()) ? "model:unknown" : "model:" + modelName.trim().toLowerCase();
    double t = weather == null ? 20.0 : Math.round(weather.temperatureC());
    double h = weather == null ? 50.0 : Math.round(weather.humidityPercent() / 5.0) * 5.0;
    double r = weather == null ? 0.0 : Math.round(weather.precipitationMm1h() * 2.0) / 2.0;
    return NS_WATERING
        + "|" + modelKey
        + "|" + plant.getName().trim().toLowerCase()
        + "|" + plant.getType().name()
        + "|" + (outdoor ? "out" : "in")
        + "|t=" + t + "|h=" + h + "|r=" + r;
  }

  private String buildChatCacheKey(String modelName, String question) {
    String modelKey = (modelName == null || modelName.isBlank()) ? "model:unknown" : "model:" + modelName.trim().toLowerCase();
    String normalizedQuestion = question == null ? "" : question.trim().toLowerCase().replaceAll("\\s+", " ");
    return NS_CHAT + "|" + modelKey + "|" + normalizedQuestion;
  }

  private String resolveTextModel(User user) {
    // ORB2: для текстовых задач всегда text-модель из глобальных настроек.
    String globalText = openRouterUserSettingsService.resolveGlobalModels().chatModel();
    if (globalText != null && !globalText.isBlank()) {
      return normalizeModelId(globalText);
    }
    if (chatModel != null && !chatModel.isBlank()) {
      return normalizeModelId(chatModel);
    }
    if (plantModel != null && !plantModel.isBlank()) {
      return normalizeModelId(plantModel);
    }
    if (model != null && !model.isBlank()) {
      return normalizeModelId(model);
    }
    return OpenRouterGlobalSettingsService.DEFAULT_CHAT_MODEL;
  }

  private String resolvePhotoModel(User user) {
    // ORB2: для задач с фото всегда vision-модель из глобальных настроек.
    String globalPhoto = openRouterUserSettingsService.resolveGlobalModels().photoRecognitionModel();
    if (globalPhoto != null && !globalPhoto.isBlank()) {
      return normalizeModelId(globalPhoto);
    }
    if (plantModel != null && !plantModel.isBlank()) {
      return normalizeModelId(plantModel);
    }
    if (model != null && !model.isBlank()) {
      return normalizeModelId(model);
    }
    return OpenRouterGlobalSettingsService.DEFAULT_PHOTO_MODEL;
  }

  private List<String> resolveTextModelCandidates(User user) {
    String primary = resolveTextModel(user);
    if (!chatFallbackEnabled) {
      return primary == null || primary.isBlank() ? List.of() : List.of(primary);
    }

    List<String> models = new ArrayList<>();
    if (primary != null && !primary.isBlank()) {
      models.add(normalizeModelId(primary));
    }
    models.add(normalizeModelId(OpenRouterGlobalSettingsService.DEFAULT_CHAT_MODEL));
    if (chatModel != null && !chatModel.isBlank()) {
      models.add(normalizeModelId(chatModel));
    }
    if (model != null && !model.isBlank()) {
      models.add(normalizeModelId(model));
    }

    List<String> dedup = new ArrayList<>();
    for (String candidate : models) {
      if (candidate == null || candidate.isBlank()) {
        continue;
      }
      boolean exists = dedup.stream().anyMatch(item -> item.equalsIgnoreCase(candidate));
      if (!exists) {
        dedup.add(candidate);
      }
    }
    return dedup;
  }

  private String resolveChatModel(User user, boolean hasPhoto) {
    if (hasPhoto) {
      return resolvePhotoModel(user);
    }
    return resolveTextModel(user);
  }

  private List<String> resolveChatModelCandidates(User user, boolean hasPhoto) {
    String primary = resolveChatModel(user, hasPhoto);
    if (!chatFallbackEnabled) {
      return primary == null || primary.isBlank() ? List.of() : List.of(primary);
    }

    List<String> models = new ArrayList<>();
    if (primary != null && !primary.isBlank()) {
      models.add(primary.trim());
    }

    // Fallback должен быть в рамках того же типа запроса: text->text, photo->photo.
    String modeDefault = hasPhoto
        ? OpenRouterGlobalSettingsService.DEFAULT_PHOTO_MODEL
        : OpenRouterGlobalSettingsService.DEFAULT_CHAT_MODEL;
    if (modeDefault != null && !modeDefault.isBlank()) {
      models.add(normalizeModelId(modeDefault));
    }

    if (!hasPhoto && chatModel != null && !chatModel.isBlank()) {
      models.add(normalizeModelId(chatModel));
    }
    if (hasPhoto && plantModel != null && !plantModel.isBlank()) {
      models.add(normalizeModelId(plantModel));
    }
    if (model != null && !model.isBlank()) {
      models.add(normalizeModelId(model));
    }

    List<String> dedup = new ArrayList<>();
    for (String candidate : models) {
      if (candidate == null || candidate.isBlank()) {
        continue;
      }
      boolean exists = dedup.stream().anyMatch(item -> item.equalsIgnoreCase(candidate));
      if (!exists) {
        dedup.add(candidate);
      }
    }
    return dedup;
  }

  private String normalizePhotoBase64(String raw) {
    if (raw == null) {
      return null;
    }
    String trimmed = raw.trim();
    if (trimmed.isEmpty()) {
      return null;
    }
    if (!trimmed.startsWith("data:image/")) {
      return null;
    }
    return trimmed;
  }

  private String normalizeModelId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "";
    }
    String cleaned = raw.trim();
    String[] commaParts = cleaned.split(",");
    if (commaParts.length > 0) {
      cleaned = commaParts[0].trim();
    }
    String[] parts = cleaned.split("\\s+");
    if (parts.length > 0) {
      cleaned = parts[0].trim();
    }
    return cleaned;
  }

  private Optional<PlantCareAdvice> getCareAdviceCache(String key) {
    Optional<OpenRouterCacheEntry> cached = openRouterCacheRepository.findByCacheKey(key);
    if (cached.isEmpty()) {
      return null;
    }
    OpenRouterCacheEntry row = cached.get();
    if (row.getExpiresAt().isBefore(Instant.now())) {
      openRouterCacheRepository.delete(row);
      return null;
    }
    if (!row.isHit()) {
      return Optional.empty();
    }
    try {
      return Optional.of(objectMapper.readValue(row.getPayload(), PlantCareAdvice.class));
    } catch (Exception ex) {
      openRouterCacheRepository.delete(row);
      return null;
    }
  }

  private void putCareAdviceCache(String key, Optional<PlantCareAdvice> value) {
    long ttlSeconds = value.isPresent()
        ? Math.max(1, careCacheTtlMinutes) * 60L
        : Math.max(30, negativeCacheTtlSeconds);
    OpenRouterCacheEntry row = openRouterCacheRepository.findByCacheKey(key).orElseGet(OpenRouterCacheEntry::new);
    row.setCacheKey(key);
    row.setNamespace(NS_CARE);
    row.setHit(value.isPresent());
    row.setExpiresAt(Instant.now().plusSeconds(ttlSeconds));
    row.setUpdatedAt(Instant.now());
    try {
      row.setPayload(value.isPresent() ? objectMapper.writeValueAsString(value.get()) : null);
    } catch (Exception ex) {
      row.setPayload(null);
      row.setHit(false);
    }
    openRouterCacheRepository.save(row);
    enforceCacheLimit();
  }

  private Optional<AIWateringProfile> getWateringProfileCache(String key) {
    Optional<OpenRouterCacheEntry> cached = openRouterCacheRepository.findByCacheKey(key);
    if (cached.isEmpty()) {
      return null;
    }
    OpenRouterCacheEntry row = cached.get();
    if (row.getExpiresAt().isBefore(Instant.now())) {
      openRouterCacheRepository.delete(row);
      return null;
    }
    if (!row.isHit()) {
      return Optional.empty();
    }
    try {
      return Optional.of(objectMapper.readValue(row.getPayload(), AIWateringProfile.class));
    } catch (Exception ex) {
      openRouterCacheRepository.delete(row);
      return null;
    }
  }

  private void putWateringProfileCache(String key, Optional<AIWateringProfile> value) {
    long ttlSeconds = value.isPresent()
        ? Math.max(1, wateringCacheTtlMinutes) * 60L
        : Math.max(30, negativeCacheTtlSeconds);
    OpenRouterCacheEntry row = openRouterCacheRepository.findByCacheKey(key).orElseGet(OpenRouterCacheEntry::new);
    row.setCacheKey(key);
    row.setNamespace(NS_WATERING);
    row.setHit(value.isPresent());
    row.setExpiresAt(Instant.now().plusSeconds(ttlSeconds));
    row.setUpdatedAt(Instant.now());
    try {
      row.setPayload(value.isPresent() ? objectMapper.writeValueAsString(value.get()) : null);
    } catch (Exception ex) {
      row.setPayload(null);
      row.setHit(false);
    }
    openRouterCacheRepository.save(row);
    enforceCacheLimit();
  }

  private Optional<String> getChatAnswerCache(String key) {
    Optional<OpenRouterCacheEntry> cached = openRouterCacheRepository.findByCacheKey(key);
    if (cached.isEmpty()) {
      return null;
    }
    OpenRouterCacheEntry row = cached.get();
    if (row.getExpiresAt().isBefore(Instant.now())) {
      openRouterCacheRepository.delete(row);
      return null;
    }
    if (!row.isHit()) {
      // Для чата не кэшируем негативные ответы: чтобы пользователь мог сразу повторить попытку.
      openRouterCacheRepository.delete(row);
      return null;
    }
    return Optional.ofNullable(row.getPayload());
  }

  private void putChatAnswerCache(String key, Optional<String> value) {
    long ttlSeconds = Math.max(1, chatCacheTtlMinutes) * 60L;
    OpenRouterCacheEntry row = openRouterCacheRepository.findByCacheKey(key).orElseGet(OpenRouterCacheEntry::new);
    row.setCacheKey(key);
    row.setNamespace(NS_CHAT);
    row.setHit(value.isPresent());
    row.setPayload(value.orElse(null));
    row.setExpiresAt(Instant.now().plusSeconds(ttlSeconds));
    row.setUpdatedAt(Instant.now());
    openRouterCacheRepository.save(row);
    enforceCacheLimit();
  }

  private void enforceCacheLimit() {
    try {
      openRouterCacheRepository.deleteExpired(Instant.now());
      long max = Math.max(100, cacheMaxEntries);
      long count = openRouterCacheRepository.count();
      if (count <= max) {
        return;
      }
      List<OpenRouterCacheEntry> oldest = openRouterCacheRepository.findTop200ByOrderByUpdatedAtAsc();
      long toDelete = count - max;
      if (toDelete <= 0 || oldest.isEmpty()) {
        return;
      }
      int end = (int) Math.min(toDelete, oldest.size());
      openRouterCacheRepository.deleteAllInBatch(oldest.subList(0, end));
    } catch (Exception ex) {
      // Ошибки обслуживания кеша не должны ронять пользовательские запросы.
      log.warn("OpenRouter cache maintenance skipped: {}", ex.getMessage());
    }
  }

  public CacheClearStats clearCaches() {
    int careSize = (int) openRouterCacheRepository.countByNamespace(NS_CARE);
    int wateringSize = (int) openRouterCacheRepository.countByNamespace(NS_WATERING);
    int chatSize = (int) openRouterCacheRepository.countByNamespace(NS_CHAT);
    openRouterCacheRepository.deleteAllInBatch();
    return new CacheClearStats(careSize, wateringSize, chatSize);
  }

  public record CacheClearStats(int careAdviceEntries, int wateringProfileEntries, int chatEntries) {
  }

  public record ChatAnswer(String answer, String model) {
  }

  public record WizardWateringRecommendation(int wateringFrequencyDays,
                                             int wateringVolumeMl,
                                             String light,
                                             String soil,
                                             String notes,
                                             String source) {
  }
}
