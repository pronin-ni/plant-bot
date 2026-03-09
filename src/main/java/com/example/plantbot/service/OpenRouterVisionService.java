package com.example.plantbot.service;

import com.example.plantbot.controller.dto.OpenRouterDiagnoseResponse;
import com.example.plantbot.controller.dto.OpenRouterIdentifyResponse;
import com.example.plantbot.domain.User;
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
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.BAD_GATEWAY;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterVisionService {
  private static final Pattern FENCED_JSON_PATTERN = Pattern.compile("(?s)^```(?:json)?\\s*(.*?)\\s*```$");

  private final RestTemplate restTemplate;
  private final ObjectMapper objectMapper;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @Value("${openrouter.model-plant:}")
  private String plantModel;

  @Value("${openrouter.model-photo-identify:}")
  private String photoIdentifyModel;

  @Value("${openrouter.model-photo-diagnose:}")
  private String photoDiagnoseModel;

  @Value("${openrouter.model:}")
  private String fallbackModel;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String baseUrl;

  @Value("${openrouter.site-url:}")
  private String siteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String appName;

  public OpenRouterIdentifyResponse identifyPlant(String imageBase64) {
    return identifyPlant(null, imageBase64);
  }

  public OpenRouterIdentifyResponse identifyPlant(User user, String imageBase64) {
    validateImage(imageBase64);
    String modelToUse = resolveIdentifyModel(user);
    JsonNode payload = callOpenRouter(user, modelToUse, identifySystemPrompt(), identifyUserPrompt(), imageBase64);

    String content = extractMessageContent(payload);
    JsonNode json = parseJsonPayload(content);

    int confidence = normalizeConfidence(json.path("confidence").asInt(0));
    int interval = clamp(json.path("watering_interval_days").asInt(7), 1, 45);

    List<String> alternatives = new ArrayList<>();
    JsonNode alternativesNode = json.path("alternatives");
    if (alternativesNode.isArray()) {
      for (JsonNode node : alternativesNode) {
        String value = node.asText("").trim();
        if (!value.isEmpty()) {
          alternatives.add(value);
        }
      }
    }

    OpenRouterIdentifyResponse response = new OpenRouterIdentifyResponse(
        textOrNull(json, "russian_name"),
        textOrNull(json, "latin_name"),
        textOrNull(json, "family"),
        confidence,
        interval,
        textOrNull(json, "light_level"),
        textOrNull(json, "humidity_percent"),
        textOrNull(json, "short_description"),
        alternatives
    );

    log.info("OpenRouter identify success: model={}, confidence={}, russian='{}', latin='{}'",
        modelToUse, response.confidence(), response.russianName(), response.latinName());

    return response;
  }

  public OpenRouterDiagnoseResponse diagnosePlant(String imageBase64, String plantName) {
    return diagnosePlant(null, imageBase64, plantName, null);
  }

  public OpenRouterDiagnoseResponse diagnosePlant(User user, String imageBase64, String plantName) {
    return diagnosePlant(user, imageBase64, plantName, null);
  }

  public OpenRouterDiagnoseResponse diagnosePlant(User user, String imageBase64, String plantName, String plantContext) {
    validateImage(imageBase64);
    if (plantName == null || plantName.isBlank()) {
      throw new ResponseStatusException(BAD_REQUEST, "plantName обязателен");
    }

    String modelToUse = resolveDiagnoseModel(user);
    JsonNode payload = callOpenRouter(user, modelToUse, diagnoseSystemPrompt(), diagnoseUserPrompt(plantName, plantContext), imageBase64);

    String content = extractMessageContent(payload);
    JsonNode json = parseJsonPayload(content);

    int confidence = normalizeConfidence(json.path("confidence").asInt(0));

    List<String> causes = new ArrayList<>();
    JsonNode causesNode = json.path("causes");
    if (causesNode.isArray()) {
      for (JsonNode node : causesNode) {
        String value = node.asText("").trim();
        if (!value.isEmpty()) {
          causes.add(value);
        }
      }
    }

    String urgency = json.path("urgency").asText("medium").toLowerCase(Locale.ROOT);
    if (!urgency.equals("low") && !urgency.equals("medium") && !urgency.equals("high")) {
      urgency = "medium";
    }

    OpenRouterDiagnoseResponse response = new OpenRouterDiagnoseResponse(
        textOrNull(json, "problem"),
        confidence,
        textOrNull(json, "description"),
        causes,
        textOrNull(json, "treatment"),
        textOrNull(json, "prevention"),
        urgency
    );

    log.info("OpenRouter diagnose success: model={}, confidence={}, problem='{}', urgency={}",
        modelToUse, response.confidence(), response.problem(), response.urgency());

    return response;
  }

  private JsonNode callOpenRouter(String model, String systemPrompt, String userPrompt, String imageBase64) {
    return callOpenRouter(null, model, systemPrompt, userPrompt, imageBase64);
  }

  private JsonNode callOpenRouter(User user, String model, String systemPrompt, String userPrompt, String imageBase64) {
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (apiKey == null || apiKey.isBlank()) {
      throw new ResponseStatusException(BAD_GATEWAY, "OpenRouter API key не настроен");
    }

    Map<String, Object> userContent = Map.of(
        "role", "user",
        "content", List.of(
            Map.of("type", "text", "text", userPrompt),
            Map.of("type", "image_url", "image_url", Map.of("url", imageBase64))
        )
    );

    Map<String, Object> requestBody = Map.of(
        "model", model,
        "temperature", 0,
        "messages", List.of(
            Map.of("role", "system", "content", systemPrompt),
            userContent
        )
    );

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(apiKey);
    if (siteUrl != null && !siteUrl.isBlank()) {
      headers.set("HTTP-Referer", siteUrl);
    }
    if (appName != null && !appName.isBlank()) {
      headers.set("X-Title", appName);
    }

    try {
      ResponseEntity<JsonNode> response = restTemplate.postForEntity(
          baseUrl,
          new HttpEntity<>(requestBody, headers),
          JsonNode.class
      );
      if (response.getBody() == null) {
        throw new ResponseStatusException(BAD_GATEWAY, "OpenRouter вернул пустой ответ");
      }
      return response.getBody();
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      log.warn("OpenRouter request failed: {}", ex.getMessage());
      throw new ResponseStatusException(BAD_GATEWAY, "Ошибка запроса к OpenRouter");
    }
  }

  private String extractMessageContent(JsonNode payload) {
    String content = payload.path("choices").path(0).path("message").path("content").asText("").trim();
    if (content.isEmpty()) {
      throw new ResponseStatusException(BAD_GATEWAY, "OpenRouter вернул пустой контент");
    }
    return content;
  }

  private JsonNode parseJsonPayload(String content) {
    try {
      String normalized = sanitizeJsonPayload(content);
      return objectMapper.readTree(normalized);
    } catch (Exception ex) {
      log.warn("OpenRouter invalid JSON payload: {}", preview(content));
      throw new ResponseStatusException(BAD_GATEWAY, "OpenRouter вернул невалидный JSON");
    }
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

  private void validateImage(String imageBase64) {
    if (imageBase64 == null || imageBase64.isBlank()) {
      throw new ResponseStatusException(BAD_REQUEST, "imageBase64 обязателен");
    }
    if (!imageBase64.startsWith("data:image/")) {
      throw new ResponseStatusException(BAD_REQUEST, "imageBase64 должен быть data:image/... base64");
    }
  }

  private int normalizeConfidence(int value) {
    return clamp(value, 0, 100);
  }

  private int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }

  private String resolveIdentifyModel(User user) {
    // OR3: модель для распознавания берём из глобальных настроек.
    String globalIdentify = openRouterUserSettingsService.resolveGlobalModels().photoRecognitionModel();
    if (globalIdentify != null && !globalIdentify.isBlank()) {
      return normalizeModelId(globalIdentify);
    }
    if (photoIdentifyModel != null && !photoIdentifyModel.isBlank()) {
      return normalizeModelId(photoIdentifyModel);
    }
    if (plantModel != null && !plantModel.isBlank()) {
      return normalizeModelId(plantModel);
    }
    if (fallbackModel != null && !fallbackModel.isBlank()) {
      return normalizeModelId(fallbackModel);
    }
    return OpenRouterGlobalSettingsService.DEFAULT_PHOTO_MODEL;
  }

  private String resolveDiagnoseModel(User user) {
    // OR3: модель для диагностики берём из глобальных настроек.
    String globalDiagnose = openRouterUserSettingsService.resolveGlobalModels().photoDiagnosisModel();
    if (globalDiagnose != null && !globalDiagnose.isBlank()) {
      return normalizeModelId(globalDiagnose);
    }
    String globalIdentify = openRouterUserSettingsService.resolveGlobalModels().photoRecognitionModel();
    if (globalIdentify != null && !globalIdentify.isBlank()) {
      return normalizeModelId(globalIdentify);
    }
    if (photoDiagnoseModel != null && !photoDiagnoseModel.isBlank()) {
      return normalizeModelId(photoDiagnoseModel);
    }
    if (photoIdentifyModel != null && !photoIdentifyModel.isBlank()) {
      return normalizeModelId(photoIdentifyModel);
    }
    if (plantModel != null && !plantModel.isBlank()) {
      return normalizeModelId(plantModel);
    }
    if (fallbackModel != null && !fallbackModel.isBlank()) {
      return normalizeModelId(fallbackModel);
    }
    return OpenRouterGlobalSettingsService.DEFAULT_PHOTO_MODEL;
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

  private String textOrNull(JsonNode node, String field) {
    String value = node.path(field).asText("").trim();
    return value.isEmpty() ? null : value;
  }

  private String preview(String value) {
    if (value == null) {
      return "";
    }
    String compact = value.replace('\n', ' ').replace('\r', ' ').trim();
    return compact.length() > 220 ? compact.substring(0, 220) + "..." : compact;
  }

  private String identifySystemPrompt() {
    return "Ты — эксперт по комнатным и садовым растениям. Твоя задача — точно определить растение по фото.\n"
        + "Отвечай ТОЛЬКО валидным JSON без каких-либо дополнительных слов, комментариев или markdown.\n"
        + "Если не уверен в определении — ставь confidence ниже 60 и укажи возможные варианты в поле alternatives.\n\n"
        + "Формат ответа (строго):\n"
        + "{\n"
        + "  \"russian_name\": \"Монстера деликатесная\",\n"
        + "  \"latin_name\": \"Monstera deliciosa\",\n"
        + "  \"family\": \"Ароидные (Araceae)\",\n"
        + "  \"confidence\": 92,\n"
        + "  \"watering_interval_days\": 7,\n"
        + "  \"light_level\": \"яркий рассеянный свет, без прямых лучей\",\n"
        + "  \"humidity_percent\": \"60–80\",\n"
        + "  \"short_description\": \"Популярное крупнолистное комнатное растение с характерными прорезями на листьях...\",\n"
        + "  \"alternatives\": [\"Monstera adansonii\", \"Philodendron bipinnatifidum\"]\n"
        + "}";
  }

  private String identifyUserPrompt() {
    return "Определи растение на фото. Укажи рекомендации по базовому уходу для комнатных условий.";
  }

  private String diagnoseSystemPrompt() {
    return "Ты — фитопатолог и специалист по уходу за растениями. Анализируй фото листа/части растения и определи возможные проблемы.\n"
        + "Отвечай ТОЛЬКО валидным JSON без лишнего текста.\n"
        + "Если проблема не очевидна — confidence низкий и предложи общие причины.\n\n"
        + "Формат ответа (строго):\n"
        + "{\n"
        + "  \"problem\": \"Паутинный клещ\",\n"
        + "  \"confidence\": 88,\n"
        + "  \"description\": \"Мелкие белые точки и тонкая паутина на нижней стороне листа, пожелтение и опадение листьев\",\n"
        + "  \"causes\": [\"Низкая влажность воздуха\", \"Высокая температура\", \"Пыль на листьях\"],\n"
        + "  \"treatment\": \"Обработать акарицидом (Фитоверм, Актеллик) 2–3 раза с интервалом 5–7 дней. Повысить влажность до 60–70%. Протирать листья влажной тканью.\",\n"
        + "  \"prevention\": \"Регулярный душ растения, поддержание влажности, карантин новых растений\",\n"
        + "  \"urgency\": \"high\"\n"
        + "}";
  }

  private String diagnoseUserPrompt(String plantName, String plantContext) {
    String context = (plantContext == null || plantContext.isBlank()) ? "" : ("\nКонтекст растения: " + plantContext.trim());
    return "Проанализируй фото. Растение — " + plantName + ". Опиши проблему и дай рекомендации по лечению." + context;
  }
}
