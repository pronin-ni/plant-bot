package com.example.plantbot.service;

import com.example.plantbot.controller.dto.OpenRouterModelOptionResponse;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterModelCatalogService {
  private static final String DEFAULT_TEXT_FALLBACK_MODEL = "arcee-ai/trinity-large-preview:free";
  private static final String DEFAULT_PHOTO_FALLBACK_MODEL = "google/gemma-3-12b-it:free";

  private final RestTemplate restTemplate;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @Value("${openrouter.models-url:https://openrouter.ai/api/v1/models}")
  private String modelsUrl;

  @Value("${openrouter.model:}")
  private String fallbackModel;

  @Value("${openrouter.model-plant:}")
  private String fallbackModelPlant;

  @Value("${openrouter.model-photo-identify:}")
  private String fallbackModelPhotoIdentify;

  @Value("${openrouter.model-photo-diagnose:}")
  private String fallbackModelPhotoDiagnose;

  @Value("${openrouter.model-chat:}")
  private String fallbackModelChat;

  public List<OpenRouterModelOptionResponse> fetchModels(User user) {
    String apiKey = openRouterUserSettingsService.resolveApiKey(user);
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (apiKey != null && !apiKey.isBlank()) {
      headers.setBearerAuth(apiKey);
    }

    try {
      ResponseEntity<JsonNode> response = restTemplate.exchange(
          modelsUrl,
          HttpMethod.GET,
          new HttpEntity<>(headers),
          JsonNode.class
      );
      JsonNode data = response.getBody() == null ? null : response.getBody().path("data");
      if (data == null || !data.isArray()) {
        return fallbackModels();
      }

      List<OpenRouterModelOptionResponse> items = new ArrayList<>();
      for (JsonNode model : data) {
        String id = text(model, "id");
        if (id == null || id.isBlank()) {
          continue;
        }
        String name = text(model, "name");
        Integer contextLength = model.path("context_length").isNumber() ? model.path("context_length").asInt() : null;
        String inputPrice = model.path("pricing").path("prompt").asText(null);
        String outputPrice = model.path("pricing").path("completion").asText(null);
        boolean free = id.endsWith(":free");
        boolean supportsImageToText = supportsImageToText(model);
        items.add(new OpenRouterModelOptionResponse(
            id,
            name == null ? id : name,
            contextLength,
            inputPrice,
            outputPrice,
            free,
            supportsImageToText
        ));
      }

      items.sort(Comparator.comparing(OpenRouterModelOptionResponse::free).reversed()
          .thenComparing(OpenRouterModelOptionResponse::id));
      return items;
    } catch (Exception ex) {
      log.warn("Unable to load OpenRouter model list: {}", ex.getMessage());
      return fallbackModels();
    }
  }

  public String resolveDynamicTextFallback(User user) {
    return resolveDynamicFallback(fetchModels(user), false);
  }

  public String resolveDynamicPhotoFallback(User user) {
    return resolveDynamicFallback(fetchModels(user), true);
  }

  public String resolveConfiguredTextFallback() {
    return firstNonBlank(fallbackModelChat, fallbackModelPlant, fallbackModel, DEFAULT_TEXT_FALLBACK_MODEL);
  }

  public String resolveConfiguredPhotoFallback() {
    return firstNonBlank(fallbackModelPhotoIdentify, fallbackModelPhotoDiagnose, DEFAULT_PHOTO_FALLBACK_MODEL);
  }

  public KeyValidationResult validateApiKey(String apiKey) {
    if (apiKey == null || apiKey.isBlank()) {
      return new KeyValidationResult(false, "API-ключ не задан");
    }

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(apiKey.trim());

    try {
      ResponseEntity<JsonNode> response = restTemplate.exchange(
          modelsUrl,
          HttpMethod.GET,
          new HttpEntity<>(headers),
          JsonNode.class
      );
      int statusCode = response.getStatusCode().value();
      if (statusCode >= 200 && statusCode < 300) {
        return new KeyValidationResult(true, "Ключ валиден");
      }
      return new KeyValidationResult(false, "OpenRouter вернул статус: " + statusCode);
    } catch (HttpStatusCodeException ex) {
      int code = ex.getStatusCode().value();
      if (code == 401 || code == 403) {
        return new KeyValidationResult(false, "Ключ отклонён OpenRouter (401/403)");
      }
      if (code == 429) {
        return new KeyValidationResult(true, "Ключ валиден, но исчерпан лимит запросов (429)");
      }
      return new KeyValidationResult(false, "OpenRouter вернул ошибку: HTTP " + code);
    } catch (Exception ex) {
      log.warn("OpenRouter key validation failed: {}", ex.getMessage());
      return new KeyValidationResult(false, "Не удалось проверить ключ: " + ex.getMessage());
    }
  }


  private List<OpenRouterModelOptionResponse> fallbackModels() {
    Map<String, OpenRouterModelOptionResponse> byId = new LinkedHashMap<>();

    // Если каталог OpenRouter недоступен, используем только модели из конфигурации окружения.
    List<String> raw = new ArrayList<>();
    raw.add(fallbackModel);
    raw.add(fallbackModelPlant);
    raw.add(fallbackModelPhotoIdentify);
    raw.add(fallbackModelPhotoDiagnose);
    raw.add(fallbackModelChat);
    for (String id : raw) {
      if (id == null || id.isBlank()) {
        continue;
      }
      String normalized = id.trim();
      byId.putIfAbsent(
          normalized,
          new OpenRouterModelOptionResponse(
              normalized,
              normalized,
              null,
              null,
              null,
              normalized.endsWith(":free"),
              isConfiguredPhotoModel(normalized)
          )
      );
    }

    List<OpenRouterModelOptionResponse> items = new ArrayList<>(byId.values());
    items.sort(Comparator.comparing(OpenRouterModelOptionResponse::free).reversed()
        .thenComparing(OpenRouterModelOptionResponse::id));
    return items;
  }

  private String resolveDynamicFallback(List<OpenRouterModelOptionResponse> models, boolean supportsImageToText) {
    Optional<String> free = models.stream()
        .filter(model -> model.supportsImageToText() == supportsImageToText)
        .filter(OpenRouterModelOptionResponse::free)
        .map(OpenRouterModelOptionResponse::id)
        .findFirst();
    if (free.isPresent()) {
      return free.get();
    }

    return models.stream()
        .filter(model -> model.supportsImageToText() == supportsImageToText)
        .map(OpenRouterModelOptionResponse::id)
        .findFirst()
        .orElse(null);
  }

  private boolean supportsImageToText(JsonNode model) {
    JsonNode architecture = model.path("architecture");
    if (!architecture.isMissingNode()) {
      boolean inputHasImage = containsIgnoreCase(architecture.path("input_modalities"), "image");
      boolean outputHasText = containsIgnoreCase(architecture.path("output_modalities"), "text");
      if (inputHasImage && outputHasText) {
        return true;
      }
    }

    // fallback для форматов без architecture
    JsonNode modalities = model.path("modalities");
    boolean inputHasImage = containsIgnoreCase(modalities.path("input"), "image");
    boolean outputHasText = containsIgnoreCase(modalities.path("output"), "text");
    return inputHasImage && outputHasText;
  }

  private boolean containsIgnoreCase(JsonNode node, String value) {
    if (node == null || node.isMissingNode()) {
      return false;
    }
    if (node.isArray()) {
      for (JsonNode item : node) {
        String text = item.asText("");
        if (text.equalsIgnoreCase(value)) {
          return true;
        }
      }
      return false;
    }
    String text = node.asText("");
    return text.equalsIgnoreCase(value);
  }

  private boolean isConfiguredPhotoModel(String modelId) {
    if (modelId == null || modelId.isBlank()) {
      return false;
    }
    String normalized = modelId.trim();
    return normalized.equalsIgnoreCase(normalize(fallbackModelPhotoIdentify))
        || normalized.equalsIgnoreCase(normalize(fallbackModelPhotoDiagnose));
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim();
  }

  private String text(JsonNode node, String field) {
    String value = node.path(field).asText(null);
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
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

  public record KeyValidationResult(
      boolean ok,
      String message
  ) {
  }
}
