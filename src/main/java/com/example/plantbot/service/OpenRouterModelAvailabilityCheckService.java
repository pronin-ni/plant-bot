package com.example.plantbot.service;

import com.example.plantbot.domain.OpenRouterModelAvailabilityStatus;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterModelAvailabilityCheckService {
  private static final String TEST_IMAGE_DATA_URI =
      "data:image/png;base64,"
          + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pY8kAAAAASUVORK5CYII=";

  private final RestTemplate restTemplate;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelCatalogService openRouterModelCatalogService;

  @Value("${openrouter.base-url:https://openrouter.ai/api/v1/chat/completions}")
  private String baseUrl;

  @Value("${openrouter.site-url:}")
  private String siteUrl;

  @Value("${openrouter.app-name:plant-bot}")
  private String appName;

  public ModelCheckResult checkCurrentTextModel() {
    return checkCurrentTextModel(null);
  }

  public ModelCheckResult checkCurrentTextModel(User user) {
    var settings = openRouterGlobalSettingsService.getOrCreate();
    var models = openRouterGlobalSettingsService.resolveModels(settings);
    String model = firstNonBlank(
        models.chatModel(),
        openRouterModelCatalogService.resolveDynamicTextFallback(user)
    );
    return runTextCheck(user, model);
  }

  public ModelCheckResult checkCurrentVisionModel() {
    return checkCurrentVisionModel(null);
  }

  public ModelCheckResult checkCurrentVisionModel(User user) {
    var settings = openRouterGlobalSettingsService.getOrCreate();
    var models = openRouterGlobalSettingsService.resolveModels(settings);
    String model = firstNonBlank(
        models.photoRecognitionModel(),
        openRouterModelCatalogService.resolveDynamicPhotoFallback(user)
    );
    return runVisionCheck(user, model);
  }

  public ModelCheckResult runTextCheck(User user, String model) {
    Instant checkedAt = Instant.now();
    if (model == null || model.isBlank()) {
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.UNAVAILABLE,
          "Текстовая модель не выбрана",
          checkedAt,
          null,
          OpenRouterFailureType.MODEL_UNAVAILABLE
      );
    }

    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (apiKey == null || apiKey.isBlank()) {
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.UNAVAILABLE,
          "OpenRouter API ключ не настроен",
          checkedAt,
          null,
          OpenRouterFailureType.INVALID_KEY
      );
    }

    try {
      JsonNode body = callOpenRouter(
          apiKey,
          model,
          List.of(
              Map.of("role", "system", "content", "Ответь одним словом ok."),
              Map.of("role", "user", "content", "ok?")
          )
      );
      String content = extractContent(body);
      if (content.isBlank()) {
          return unavailable(model, checkedAt, "OpenRouter вернул пустой ответ для text-модели", OpenRouterFailureType.TEMPORARY_ERROR);
      }
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.AVAILABLE,
          "Текстовая модель доступна",
          checkedAt,
          checkedAt,
          null
      );
      } catch (HttpStatusCodeException ex) {
        return classifyHttpFailure(model, checkedAt, ex, false);
      } catch (ResourceAccessException ex) {
        return degraded(model, checkedAt, "Сетевой сбой при проверке text-модели: " + ex.getMessage(), OpenRouterFailureType.NETWORK_ERROR);
      } catch (Exception ex) {
        return degraded(model, checkedAt, "Ошибка проверки text-модели: " + ex.getMessage(), OpenRouterFailureType.TEMPORARY_ERROR);
      }
  }

  public ModelCheckResult runVisionCheck(User user, String model) {
    Instant checkedAt = Instant.now();
    if (model == null || model.isBlank()) {
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.UNAVAILABLE,
          "Vision модель не выбрана",
          checkedAt,
          null,
          OpenRouterFailureType.MODEL_UNAVAILABLE
      );
    }

    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    if (apiKey == null || apiKey.isBlank()) {
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.UNAVAILABLE,
          "OpenRouter API ключ не настроен",
          checkedAt,
          null,
          OpenRouterFailureType.INVALID_KEY
      );
    }

    try {
      JsonNode body = callOpenRouter(
          apiKey,
          model,
          List.of(
              Map.of("role", "system", "content", "Коротко опиши изображение одним словом."),
              Map.of(
                  "role", "user",
                  "content", List.of(
                      Map.of("type", "text", "text", "Что на изображении?"),
                      Map.of("type", "image_url", "image_url", Map.of("url", TEST_IMAGE_DATA_URI))
                  )
              )
          )
      );
      String content = extractContent(body);
      if (content.isBlank()) {
          return unavailable(model, checkedAt, "OpenRouter вернул пустой ответ для vision-модели", OpenRouterFailureType.TEMPORARY_ERROR);
      }
      return new ModelCheckResult(
          model,
          OpenRouterModelAvailabilityStatus.AVAILABLE,
          "Vision модель доступна",
          checkedAt,
          checkedAt,
          null
      );
      } catch (HttpStatusCodeException ex) {
        return classifyHttpFailure(model, checkedAt, ex, true);
      } catch (ResourceAccessException ex) {
        return degraded(model, checkedAt, "Сетевой сбой при проверке vision-модели: " + ex.getMessage(), OpenRouterFailureType.NETWORK_ERROR);
      } catch (Exception ex) {
        return degraded(model, checkedAt, "Ошибка проверки vision-модели: " + ex.getMessage(), OpenRouterFailureType.TEMPORARY_ERROR);
      }
  }

  private JsonNode callOpenRouter(String apiKey, String model, List<Map<String, Object>> messages) {
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
        "max_tokens", 12,
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
    if (body == null) {
      return "";
    }
    return AiResponseContentExtractor.extractTextContent(body);
  }

  private ModelCheckResult classifyHttpFailure(String model, Instant checkedAt, HttpStatusCodeException ex, boolean vision) {
    int code = ex.getStatusCode().value();
    String suffix = vision ? "vision-модели" : "text-модели";
    String body = ex.getResponseBodyAsString();
    String lowerBody = body == null ? "" : body.toLowerCase();

    if (code == 401 || code == 403) {
        return unavailable(model, checkedAt, "Ключ отклонён OpenRouter при проверке " + suffix, OpenRouterFailureType.INVALID_KEY);
    }
    if (code == 429) {
      return degraded(model, checkedAt, "Лимит запросов OpenRouter исчерпан при проверке " + suffix, OpenRouterFailureType.RATE_LIMIT);
    }
    if (code == 404 || lowerBody.contains("model") || lowerBody.contains("provider route") || lowerBody.contains("no endpoints")) {
      return unavailable(model, checkedAt, "Выбранная модель недоступна для проверки: HTTP " + code, OpenRouterFailureType.MODEL_UNAVAILABLE);
    }
    if (code >= 500) {
      return degraded(model, checkedAt, "Временная ошибка OpenRouter при проверке " + suffix + ": HTTP " + code, OpenRouterFailureType.TEMPORARY_ERROR);
    }
    return degraded(model, checkedAt, "Ошибка проверки " + suffix + ": HTTP " + code, OpenRouterFailureType.TEMPORARY_ERROR);
  }

  private ModelCheckResult unavailable(String model, Instant checkedAt, String message, OpenRouterFailureType type) {
    return new ModelCheckResult(
        model,
        OpenRouterModelAvailabilityStatus.UNAVAILABLE,
        message,
        checkedAt,
        null,
        type
    );
  }

  private ModelCheckResult degraded(String model, Instant checkedAt, String message, OpenRouterFailureType type) {
    return new ModelCheckResult(
        model,
        OpenRouterModelAvailabilityStatus.DEGRADED,
        message,
        checkedAt,
        null,
        type
    );
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  public record ModelCheckResult(
      String model,
      OpenRouterModelAvailabilityStatus status,
      String message,
      Instant checkedAt,
      Instant successfulAt,
      OpenRouterFailureType failureType
  ) {
  }
}
