package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleCapabilityTestResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleTestRequest;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenAiCompatibleAdminTestServiceTest {
  @Mock
  private AiProviderSettingsService aiProviderSettingsService;

  @Mock
  private OpenAiExecutionService openAiExecutionService;

  @Mock
  private AiRequestAnalyticsService aiRequestAnalyticsService;

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void connectionTestUsesTemporaryRuntimeAndRecordsSuccess() throws Exception {
    OpenAiCompatibleAdminTestService service = new OpenAiCompatibleAdminTestService(
        aiProviderSettingsService,
        openAiExecutionService,
        aiRequestAnalyticsService,
        objectMapper
    );
    User admin = new User();
    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENAI_COMPATIBLE,
        AiCapability.TEXT,
        "gpt-4o-mini",
        "sk-test",
        "https://api.example.com/v1/chat/completions",
        15000,
        256,
        true
    );
    when(aiProviderSettingsService.resolveTestRuntime(any(), any(), any(), any(), any(), any(), eq(admin), eq(AiCapability.TEXT))).thenReturn(runtime);
    when(openAiExecutionService.executeChatCompletion(eq("sk-test"), eq("https://api.example.com/v1/chat/completions"), eq("gpt-4o-mini"), eq(15000), eq(256), any()))
        .thenReturn(objectMapper.readTree("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"));

    AdminOpenAiCompatibleCapabilityTestResponse result = service.testConnection(admin, new AdminOpenAiCompatibleTestRequest(
        "https://api.example.com/v1/chat/completions",
        "sk-test",
        "gpt-4o-mini",
        "gpt-4o-mini",
        15000,
        256
    ));

    assertTrue(result.ok());
    assertEquals("connection", result.capability());
    assertEquals("gpt-4o-mini", result.model());
    verify(aiRequestAnalyticsService).record(eq(AiRequestKind.ADMIN_PROVIDER_TEST_CONNECTION), eq(AiProviderType.OPENAI_COMPATIBLE), eq(AiCapability.TEXT), eq("OPENAI_COMPATIBLE:https://api.example.com/v1/chat/completions:gpt-4o-mini"), eq(true), eq(null), anyLong());
  }

  @Test
  void jsonTestFailsClearlyWhenResponseIsNotJson() throws Exception {
    OpenAiCompatibleAdminTestService service = new OpenAiCompatibleAdminTestService(
        aiProviderSettingsService,
        openAiExecutionService,
        aiRequestAnalyticsService,
        objectMapper
    );
    User admin = new User();
    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENAI_COMPATIBLE,
        AiCapability.TEXT,
        "json-model",
        "sk-test",
        "https://api.example.com/v1/chat/completions",
        12000,
        128,
        true
    );
    when(aiProviderSettingsService.resolveTestRuntime(any(), any(), any(), any(), any(), any(), eq(admin), eq(AiCapability.TEXT))).thenReturn(runtime);
    when(openAiExecutionService.executeChatCompletion(eq("sk-test"), eq("https://api.example.com/v1/chat/completions"), eq("json-model"), eq(12000), eq(128), any()))
        .thenReturn(objectMapper.readTree("{\"choices\":[{\"message\":{\"content\":\"not-json\"}}]}"));

    AdminOpenAiCompatibleCapabilityTestResponse result = service.testJson(admin, new AdminOpenAiCompatibleTestRequest(
        null,
        null,
        null,
        null,
        null,
        null
    ));

    assertFalse(result.ok());
    assertEquals("json", result.capability());
    assertEquals(Boolean.FALSE, result.jsonValid());
    verify(aiRequestAnalyticsService).record(eq(AiRequestKind.ADMIN_PROVIDER_TEST_JSON), eq(AiProviderType.OPENAI_COMPATIBLE), eq(AiCapability.TEXT), eq("OPENAI_COMPATIBLE:https://api.example.com/v1/chat/completions:json-model"), eq(false), eq("OpenAI-compatible provider returned invalid JSON"), anyLong());
  }

  @Test
  void visionTestReturnsConfigurationFailureWithoutCrash() {
    OpenAiCompatibleAdminTestService service = new OpenAiCompatibleAdminTestService(
        aiProviderSettingsService,
        openAiExecutionService,
        aiRequestAnalyticsService,
        objectMapper
    );
    User admin = new User();
    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENAI_COMPATIBLE,
        AiCapability.VISION,
        null,
        null,
        "https://api.example.com/v1/chat/completions",
        12000,
        128,
        false
    );
    when(aiProviderSettingsService.resolveTestRuntime(any(), any(), any(), any(), any(), any(), eq(admin), eq(AiCapability.VISION))).thenReturn(runtime);

    AdminOpenAiCompatibleCapabilityTestResponse result = service.testVision(admin, new AdminOpenAiCompatibleTestRequest(null, null, null, null, null, null));

    assertFalse(result.ok());
    assertEquals("vision", result.capability());
    assertEquals(Boolean.FALSE, result.visionSupported());
    verify(aiRequestAnalyticsService).record(eq(AiRequestKind.ADMIN_PROVIDER_TEST_VISION), eq(AiProviderType.OPENAI_COMPATIBLE), eq(AiCapability.VISION), eq("OPENAI_COMPATIBLE:https://api.example.com/v1/chat/completions:unknown"), eq(false), eq("AI runtime is not configured"), eq(0L));
  }
}
