package com.example.plantbot.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

@ExtendWith(MockitoExtension.class)
class OpenAiCompatibleModelCatalogServiceTest {
  @Mock
  private AiProviderSettingsService aiProviderSettingsService;

  private RestTemplate restTemplate;
  private MockRestServiceServer server;
  private OpenAiCompatibleModelCatalogService service;

  @BeforeEach
  void setUp() {
    restTemplate = new RestTemplate();
    server = MockRestServiceServer.bindTo(restTemplate).build();
    service = new OpenAiCompatibleModelCatalogService(restTemplate, aiProviderSettingsService);
    lenient().when(aiProviderSettingsService.normalizeOpenAiBaseUrl(anyString())).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void shouldResolveModelsUrlFromChatCompletionsBaseUrl() {
    assertEquals(
        "https://ai.okgk.ru/v1/models",
        service.resolveModelsUrl(null, "https://ai.okgk.ru/v1/chat/completions")
    );
  }

  @Test
  void shouldParseOpenAiCompatibleModelCatalog() {
    server.expect(once(), requestTo("https://ai.okgk.ru/v1/models"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("""
            {
              "object": "list",
              "data": [
                {
                  "id": "browser/yandex",
                  "object": "model",
                  "provider_id": "yandex",
                  "transport": "browser",
                  "enabled": true,
                  "available": true
                },
                {
                  "id": "browser/qwen-vl",
                  "object": "model",
                  "provider_id": "qwen",
                  "transport": "browser",
                  "enabled": true,
                  "available": true,
                  "architecture": {
                    "input_modalities": ["text", "image"],
                    "output_modalities": ["text"]
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));

    var result = service.fetchModels("https://ai.okgk.ru/v1/chat/completions", null, null);

    server.verify();
    assertEquals("https://ai.okgk.ru/v1/models", result.modelsUrl());
    assertEquals(2, result.models().size());
    assertEquals("browser/qwen-vl", result.models().get(0).id());
    assertTrue(result.models().get(0).supportsImageToText());
    assertEquals("browser/yandex", result.models().get(1).id());
    assertFalse(result.models().get(1).supportsImageToText());
  }

  @Test
  void shouldReturnGracefulMessageWhenCatalogIsRegionBlocked() {
    server.expect(once(), requestTo("https://ai.okgk.ru/v1/models"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withStatus(HttpStatus.FORBIDDEN)
            .contentType(MediaType.APPLICATION_JSON)
            .body("""
                {
                  "error": {
                    "code": "unsupported_country_region_territory",
                    "message": "Country, region, or territory not supported"
                  }
                }
                """));

    var result = service.fetchModels("https://ai.okgk.ru/v1/chat/completions", null, null);

    server.verify();
    assertEquals("https://ai.okgk.ru/v1/models", result.modelsUrl());
    assertTrue(result.models().isEmpty());
    assertEquals(
        "Каталог моделей недоступен из региона сервера провайдера. Используйте ручной ввод модели или уже сохранённую модель.",
        result.message()
    );
  }
}
