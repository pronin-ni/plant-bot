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
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterModelCatalogService {
  private final RestTemplate restTemplate;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @Value("${openrouter.models-url:https://openrouter.ai/api/v1/models}")
  private String modelsUrl;

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
        return List.of();
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
        items.add(new OpenRouterModelOptionResponse(id, name == null ? id : name, contextLength, inputPrice, outputPrice, free));
      }

      items.sort(Comparator.comparing(OpenRouterModelOptionResponse::free).reversed()
          .thenComparing(OpenRouterModelOptionResponse::id));
      return items;
    } catch (Exception ex) {
      log.warn("Unable to load OpenRouter model list: {}", ex.getMessage());
      return List.of();
    }
  }

  private String text(JsonNode node, String field) {
    String value = node.path(field).asText(null);
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }
}
