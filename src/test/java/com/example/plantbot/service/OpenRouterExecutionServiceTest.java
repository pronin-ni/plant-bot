package com.example.plantbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenRouterExecutionServiceTest {
  @Mock
  private RestTemplateBuilder restTemplateBuilder;

  @Mock
  private RestTemplate restTemplate;

  @Mock
  private OpenRouterGlobalSettingsService settingsService;

  @Mock
  private OpenRouterModelHealthService healthService;

  @Mock
  private PerformanceMetricsService performanceMetricsService;

  private final ObjectMapper objectMapper = new ObjectMapper();

  private OpenRouterExecutionService service;

  @BeforeEach
  void setUp() {
    service = new OpenRouterExecutionService(restTemplateBuilder, settingsService, healthService, performanceMetricsService);
    when(restTemplateBuilder.setConnectTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
    when(restTemplateBuilder.setReadTimeout(any(Duration.class))).thenReturn(restTemplateBuilder);
    when(restTemplateBuilder.build()).thenReturn(restTemplate);
    when(settingsService.resolveRetryCount()).thenReturn(1);
    when(settingsService.resolveRetryBaseDelayMs()).thenReturn(1);
    when(settingsService.resolveRetryMaxDelayMs()).thenReturn(2);
    when(settingsService.resolveRequestTimeoutMs()).thenReturn(1500);
    when(healthService.shouldAllowRequest(OpenRouterModelKind.TEXT, "model/test")).thenReturn(true);
  }

  @Test
  void shouldRetryTransientFailureAndRecover() throws Exception {
    JsonNode payload = objectMapper.readTree("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}");
    when(restTemplate.postForEntity(anyString(), any(), any(Class.class)))
        .thenThrow(new ResourceAccessException("timed out"))
        .thenReturn(ResponseEntity.ok(payload));

    JsonNode actual = service.executeChatCompletion(
        "token",
        "model/test",
        OpenRouterModelKind.TEXT,
        "https://example.test",
        "https://app.test",
        "plant-bot",
        List.of(Map.of("role", "user", "content", "hi"))
    );

    assertEquals("ok", actual.path("choices").path(0).path("message").path("content").asText());
    verify(healthService).recordSuccess(OpenRouterModelKind.TEXT, "model/test");
    verify(healthService, never()).recordFailure(any(), anyString(), any(), anyString());
  }

  @Test
  void shouldRecordFailureAfterRetriesExhausted() {
    doThrow(new ResourceAccessException("timed out"))
        .when(restTemplate)
        .postForEntity(anyString(), any(), any(Class.class));

    OpenRouterExecutionException error = assertThrows(OpenRouterExecutionException.class, () -> service.executeChatCompletion(
        "token",
        "model/test",
        OpenRouterModelKind.TEXT,
        "https://example.test",
        "https://app.test",
        "plant-bot",
        List.of(Map.of("role", "user", "content", "hi"))
    ));

    assertEquals(OpenRouterFailureType.TIMEOUT, error.getFailureType());
    verify(healthService).recordFailure(OpenRouterModelKind.TEXT, "model/test", OpenRouterFailureType.TIMEOUT, "OpenRouter не ответил вовремя");
  }
}
