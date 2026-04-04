package com.example.plantbot.service;

import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiExecutionServiceTest {
  @Mock
  private AiProviderSettingsService aiProviderSettingsService;

  @Mock
  private OpenRouterExecutionService openRouterExecutionService;

  @Mock
  private OpenAiExecutionService openAiExecutionService;

  @Mock
  private AiRequestAnalyticsService aiRequestAnalyticsService;

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void shouldRouteOpenAiRuntimeAndRecordSuccess() throws Exception {
    AiExecutionService service = new AiExecutionService(
        aiProviderSettingsService,
        openRouterExecutionService,
        openAiExecutionService,
        aiRequestAnalyticsService
    );
    JsonNode payload = objectMapper.readTree("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}");
    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENAI_COMPATIBLE,
        AiCapability.TEXT,
        "gpt-4o-mini",
        "key",
        "https://api.openai.com/v1/chat/completions",
        15000,
        256,
        true
    );

    when(openAiExecutionService.executeChatCompletion(eq("key"), eq("https://api.openai.com/v1/chat/completions"), eq("gpt-4o-mini"), eq(15000), eq(256), any())).thenReturn(payload);

    AiExecutionService.AiExecutionResult result = service.execute(
        runtime,
        AiRequestKind.ASSISTANT_CHAT,
        List.of(Map.of("role", "user", "content", "hi"))
    );

    assertEquals(AiProviderType.OPENAI_COMPATIBLE, result.provider());
    assertEquals("gpt-4o-mini", result.model());
    verify(openAiExecutionService).executeChatCompletion(eq("key"), eq("https://api.openai.com/v1/chat/completions"), eq("gpt-4o-mini"), eq(15000), eq(256), any());
    verify(openRouterExecutionService, never()).executeChatCompletion(anyString(), anyString(), any(), anyString(), anyString(), anyString(), any());
    verify(aiRequestAnalyticsService).record(
        eq(AiRequestKind.ASSISTANT_CHAT),
        eq(AiProviderType.OPENAI_COMPATIBLE),
        eq(AiCapability.TEXT),
        eq("OPENAI_COMPATIBLE:https://api.openai.com/v1/chat/completions:gpt-4o-mini"),
        eq(true),
        eq(null),
        anyLong()
    );
  }

  @Test
  void shouldRecordFailureForOpenRouterRuntime() {
    AiExecutionService service = new AiExecutionService(
        aiProviderSettingsService,
        openRouterExecutionService,
        openAiExecutionService,
        aiRequestAnalyticsService
    );
    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENROUTER,
        AiCapability.VISION,
        "google/gemma-3-12b-it:free",
        "key",
        null,
        null,
        null,
        true
    );

    when(openRouterExecutionService.executeChatCompletion(anyString(), anyString(), any(), any(), any(), any(), any()))
        .thenThrow(new OpenRouterExecutionException(OpenRouterFailureType.TIMEOUT, true, "timeout"));

    assertThrows(OpenRouterExecutionException.class, () -> service.execute(
        runtime,
        AiRequestKind.PHOTO_IDENTIFY,
        List.of(Map.of("role", "user", "content", "hi"))
    ));

    verify(aiRequestAnalyticsService).record(
        eq(AiRequestKind.PHOTO_IDENTIFY),
        eq(AiProviderType.OPENROUTER),
        eq(AiCapability.VISION),
        eq("OPENROUTER:google/gemma-3-12b-it:free"),
        eq(false),
        eq("timeout"),
        anyLong()
    );
  }
}
