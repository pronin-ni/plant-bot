package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminAiSettingsUpdateRequest;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.repository.GlobalSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiProviderSettingsServiceTest {
  @Mock
  private GlobalSettingsRepository globalSettingsRepository;

  @Mock
  private OpenRouterApiKeyCryptoService cryptoService;

  @Mock
  private OpenRouterGlobalSettingsService openRouterGlobalSettingsService;

  @Mock
  private OpenRouterModelCatalogService openRouterModelCatalogService;

  private AiProviderSettingsService service;
  private GlobalSettings settings;

  @BeforeEach
  void setUp() {
    service = new AiProviderSettingsService(
        globalSettingsRepository,
        cryptoService,
        openRouterGlobalSettingsService,
        openRouterModelCatalogService
    );
    ReflectionTestUtils.setField(service, "fallbackOpenAiApiKey", "env-openai-key");
    ReflectionTestUtils.setField(service, "fallbackOpenAiBaseUrl", "https://api.openai.com/v1/chat/completions");
    ReflectionTestUtils.setField(service, "fallbackOpenAiTextModel", "gpt-4o-mini");
    ReflectionTestUtils.setField(service, "fallbackOpenAiVisionModel", "gpt-4o-mini");

    settings = new GlobalSettings();
    settings.setId(1L);
    lenient().when(globalSettingsRepository.findById(1L)).thenReturn(Optional.of(settings));
    lenient().when(globalSettingsRepository.save(any(GlobalSettings.class))).thenAnswer(invocation -> invocation.getArgument(0));
    lenient().when(openRouterGlobalSettingsService.resolveModels(any(GlobalSettings.class)))
        .thenReturn(new OpenRouterGlobalSettingsService.ResolvedModels("router-text", "router-vision", "router-vision"));
    lenient().when(openRouterGlobalSettingsService.resolveApiKey(any(GlobalSettings.class))).thenReturn("router-key");
  }

  @Test
  void shouldResolveOpenAiRuntimeFromActiveProvider() {
    settings.setActiveTextProvider(AiProviderType.OPENAI_COMPATIBLE);
    settings.setOpenaiCompatibleTextModel("gpt-4.1-mini");

    AiProviderSettingsService.RuntimeResolution runtime = service.resolveRuntime(null, AiCapability.TEXT);

    assertEquals(AiProviderType.OPENAI_COMPATIBLE, runtime.provider());
    assertEquals("gpt-4.1-mini", runtime.model());
    assertEquals("https://api.openai.com/v1/chat/completions", runtime.baseUrl());
    assertTrue(runtime.hasApiKey());
  }

  @Test
  void shouldUpdateActiveProvidersAndModels() {
    AiProviderSettingsService.UpdateResult result = service.update(new AdminAiSettingsUpdateRequest(
        AiProviderType.OPENAI,
        AiProviderType.OPENROUTER,
        "router-text-next",
        "router-vision-next",
        "https://openai-compatible.example/v1/chat/completions",
        "gpt-4.1-mini",
        "gpt-4o-mini",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null
    ));

    assertEquals(AiProviderType.OPENAI_COMPATIBLE, result.summary().activeTextProvider());
    assertEquals(AiProviderType.OPENROUTER, result.summary().activeVisionProvider());
    assertEquals("router-text-next", result.summary().openrouterTextModel());
    assertEquals("gpt-4.1-mini", result.summary().openaiCompatibleTextModel());
    assertEquals("https://openai-compatible.example/v1/chat/completions", result.summary().openaiCompatibleBaseUrl());
  }
}
