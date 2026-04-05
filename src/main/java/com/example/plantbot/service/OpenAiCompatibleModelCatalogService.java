package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.OpenAiCompatibleModelOptionResponse;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.GlobalSettings;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenAiCompatibleModelCatalogService {
  private final RestTemplate restTemplate;
  private final AiProviderSettingsService aiProviderSettingsService;

  public CatalogResult fetchConfiguredModels() {
    GlobalSettings settings = aiProviderSettingsService.getOrCreate();
    return fetchModels(
        aiProviderSettingsService.resolveBaseUrl(settings, AiProviderType.OPENAI_COMPATIBLE),
        aiProviderSettingsService.resolveModelsUrl(settings, AiProviderType.OPENAI_COMPATIBLE),
        aiProviderSettingsService.resolveApiKey(settings, AiProviderType.OPENAI_COMPATIBLE)
    );
  }

  public CatalogResult fetchModels(String baseUrl, String modelsUrlOverride, String apiKey) {
    String resolvedBaseUrl = aiProviderSettingsService.normalizeOpenAiBaseUrl(baseUrl);
    String resolvedModelsUrl = resolveModelsUrl(modelsUrlOverride, resolvedBaseUrl);

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (apiKey != null && !apiKey.isBlank()) {
      headers.setBearerAuth(apiKey.trim());
    }

    try {
      ResponseEntity<JsonNode> response = restTemplate.exchange(
          resolvedModelsUrl,
          HttpMethod.GET,
          new HttpEntity<>(headers),
          JsonNode.class
      );
      JsonNode body = response.getBody();
      List<OpenAiCompatibleModelOptionResponse> models = parseModels(body);
      return new CatalogResult(resolvedBaseUrl, resolvedModelsUrl, models, models.isEmpty() ? "Список моделей пуст" : null);
    } catch (HttpStatusCodeException ex) {
      String message = classifyCatalogFailure(ex);
      log.warn("OpenAI-compatible model catalog HTTP failure: baseUrl='{}' modelsUrl='{}' status={} reason={}",
          resolvedBaseUrl,
          resolvedModelsUrl,
          ex.getStatusCode().value(),
          message);
      return new CatalogResult(resolvedBaseUrl, resolvedModelsUrl, List.of(), message);
    } catch (Exception ex) {
      log.warn("OpenAI-compatible model catalog request failed: baseUrl='{}' modelsUrl='{}' reason={}", resolvedBaseUrl, resolvedModelsUrl, ex.getMessage());
      return new CatalogResult(
          resolvedBaseUrl,
          resolvedModelsUrl,
          List.of(),
          "Не удалось загрузить каталог OpenAI-compatible моделей: " + safeMessage(ex)
      );
    }
  }

  public String resolveModelsUrl(String modelsUrlOverride, String baseUrl) {
    String explicit = normalizeUrl(modelsUrlOverride);
    if (explicit != null) {
      return explicit;
    }

    String normalizedBase = aiProviderSettingsService.normalizeOpenAiBaseUrl(baseUrl);
    if (normalizedBase == null || normalizedBase.isBlank()) {
      return null;
    }

    try {
      URI uri = URI.create(normalizedBase);
      String path = uri.getPath();
      if (path == null || path.isBlank() || "/".equals(path)) {
        path = "/v1/models";
      } else if (path.endsWith("/chat/completions")) {
        path = path.substring(0, path.length() - "/chat/completions".length()) + "/models";
      } else if (path.endsWith("/responses")) {
        path = path.substring(0, path.length() - "/responses".length()) + "/models";
      } else if ("/v1".equals(path)) {
        path = "/v1/models";
      } else if (!path.endsWith("/models")) {
        path = path + (path.endsWith("/") ? "models" : "/models");
      }
      return new URI(uri.getScheme(), uri.getUserInfo(), uri.getHost(), uri.getPort(), path, uri.getQuery(), uri.getFragment()).toString();
    } catch (Exception ex) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible models URL is invalid", ex);
    }
  }

  private String normalizeUrl(String value) {
    String normalized = aiProviderSettingsService.normalizeOpenAiBaseUrl(value);
    if (normalized == null || normalized.isBlank()) {
      return null;
    }
    try {
      URI uri = URI.create(normalized);
      String path = uri.getPath();
      if (path == null || path.isBlank() || "/".equals(path) || "/v1".equals(path)) {
        path = "/v1/models";
      } else if (path.endsWith("/chat/completions")) {
        path = path.substring(0, path.length() - "/chat/completions".length()) + "/models";
      }
      return new URI(uri.getScheme(), uri.getUserInfo(), uri.getHost(), uri.getPort(), path, uri.getQuery(), uri.getFragment()).toString();
    } catch (Exception ex) {
      throw new OpenAiExecutionException(false, "OpenAI-compatible models URL is invalid", ex);
    }
  }

  private List<OpenAiCompatibleModelOptionResponse> parseModels(JsonNode body) {
    JsonNode items = body == null ? null : body.path("data");
    if (items == null || !items.isArray()) {
      return List.of();
    }

    List<OpenAiCompatibleModelOptionResponse> models = new ArrayList<>();
    for (JsonNode item : items) {
      String id = text(item, "id");
      if (id == null || id.isBlank()) {
        continue;
      }
      models.add(new OpenAiCompatibleModelOptionResponse(
          id,
          firstNonBlank(text(item, "name"), id),
          item.path("context_length").isNumber() ? item.path("context_length").asInt() : null,
          text(item.path("pricing"), "prompt"),
          text(item.path("pricing"), "completion"),
          supportsImageToText(item),
          !item.has("available") || item.path("available").asBoolean(true),
          !item.has("enabled") || item.path("enabled").asBoolean(true),
          text(item, "provider_id"),
          text(item, "transport")
      ));
    }
    models.sort(Comparator.comparing(OpenAiCompatibleModelOptionResponse::available).reversed()
        .thenComparing(OpenAiCompatibleModelOptionResponse::enabled).reversed()
        .thenComparing(OpenAiCompatibleModelOptionResponse::id));
    return models;
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

    JsonNode modalities = model.path("modalities");
    boolean inputHasImage = containsIgnoreCase(modalities.path("input"), "image");
    boolean outputHasText = containsIgnoreCase(modalities.path("output"), "text");
    if (inputHasImage && outputHasText) {
      return true;
    }

    return containsIgnoreCase(model.path("capabilities"), "vision");
  }

  private boolean containsIgnoreCase(JsonNode node, String value) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return false;
    }
    if (node.isArray()) {
      for (JsonNode item : node) {
        if (containsIgnoreCase(item, value)) {
          return true;
        }
      }
      return false;
    }
    return value.equalsIgnoreCase(node.asText(""));
  }

  private String text(JsonNode node, String field) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    String value = node.path(field).asText(null);
    return value == null || value.isBlank() ? null : value.trim();
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

  private String safeMessage(Exception ex) {
    return ex == null || ex.getMessage() == null ? "unknown" : ex.getMessage();
  }

  private String classifyCatalogFailure(HttpStatusCodeException ex) {
    int code = ex.getStatusCode().value();
    String body = ex.getResponseBodyAsString();
    String lowerBody = body == null ? "" : body.toLowerCase();
    if (lowerBody.contains("unsupported_country_region_territory") || lowerBody.contains("country, region, or territory not supported")) {
      return "Каталог моделей недоступен из региона сервера провайдера. Используйте ручной ввод модели или уже сохранённую модель.";
    }
    if (code == 401 || code == 403) {
      return "OpenAI-compatible каталог отклонил доступ. Проверьте API key, региональные ограничения и права на /v1/models.";
    }
    if (code == 404) {
      return "OpenAI-compatible каталог не найден по указанному models URL.";
    }
    if (code == 429) {
      return "OpenAI-compatible каталог временно вернул rate limit.";
    }
    if (code >= 500) {
      return "OpenAI-compatible каталог временно недоступен: HTTP " + code;
    }
    return "OpenAI-compatible каталог вернул HTTP " + code;
  }

  public record CatalogResult(
      String baseUrl,
      String modelsUrl,
      List<OpenAiCompatibleModelOptionResponse> models,
      String message
  ) {
  }
}
