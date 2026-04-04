package com.example.plantbot.service;

import com.example.plantbot.controller.dto.OpenRouterDiagnoseResponse;
import com.example.plantbot.controller.dto.OpenRouterIdentifyResponse;
import com.example.plantbot.controller.dto.OpenRouterModelOptionResponse;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.domain.AiTextFeatureType;
import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OpenRouterVisionServiceTest {
  private static final String DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pY8kAAAAASUVORK5CYII=";

  @Mock
  private AiTextCacheService aiTextCacheService;

  @Mock
  private AiProviderSettingsService aiProviderSettingsService;

  @Mock
  private AiExecutionService aiExecutionService;

  @Mock
  private OpenRouterModelCatalogService openRouterModelCatalogService;

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void identifyPlantRetriesAlternativeVisionModelWhenPrimaryFails() throws Exception {
    OpenRouterVisionService service = new OpenRouterVisionService(
        objectMapper,
        aiTextCacheService,
        aiProviderSettingsService,
        aiExecutionService,
        openRouterModelCatalogService
    );
    User user = new User();
    user.setId(7L);

    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENROUTER,
        AiCapability.VISION,
        "google/gemma-3-27b-it:free",
        "key",
        null,
        null,
        null,
        true
    );
    when(aiProviderSettingsService.resolveVisionRuntime(user)).thenReturn(runtime);
    when(aiTextCacheService.find(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_IDENTIFY_TEXT), eq(runtime.analyticsModelKey()), any(), eq(OpenRouterIdentifyResponse.class)))
        .thenReturn(new AiTextCacheService.CacheLookupResult<>(AiTextCacheService.CacheStatus.MISS, "k", "h", null, null));
    when(openRouterModelCatalogService.resolveConfiguredPhotoFallback()).thenReturn("google/gemma-3-12b-it:free");
    when(openRouterModelCatalogService.resolveDynamicPhotoFallback(user)).thenReturn("nvidia/nemotron-nano-12b-v2-vl:free");
    when(openRouterModelCatalogService.fetchModels(user)).thenReturn(List.of(
        new OpenRouterModelOptionResponse("google/gemma-3-27b-it:free", "g27", null, null, null, true, true),
        new OpenRouterModelOptionResponse("nvidia/nemotron-nano-12b-v2-vl:free", "nvidia", null, null, null, true, true)
    ));
    when(aiExecutionService.execute(eq(runtime), eq(AiRequestKind.PHOTO_IDENTIFY), any()))
        .thenThrow(new OpenRouterExecutionException(OpenRouterFailureType.RATE_LIMIT, true, "OpenRouter вернул rate limit"));
    when(aiExecutionService.execute(any(AiProviderSettingsService.RuntimeResolution.class), eq(AiRequestKind.PHOTO_IDENTIFY), any()))
        .thenReturn(new AiExecutionService.AiExecutionResult(
            AiProviderType.OPENROUTER,
            AiCapability.VISION,
            "nvidia/nemotron-nano-12b-v2-vl:free",
            objectMapper.readTree("{\"choices\":[{\"message\":{\"content\":\"{\\\"russian_name\\\":\\\"Монстера\\\",\\\"latin_name\\\":\\\"Monstera deliciosa\\\",\\\"family\\\":\\\"Araceae\\\",\\\"confidence\\\":92,\\\"watering_interval_days\\\":7,\\\"light_level\\\":\\\"bright\\\",\\\"humidity_percent\\\":\\\"60-80\\\",\\\"short_description\\\":\\\"Large tropical plant\\\",\\\"alternatives\\\":[\\\"Monstera adansonii\\\"]}\"}}]}")
        ));

    OpenRouterIdentifyResponse response = service.identifyPlant(user, DATA_URI);

    assertEquals("Монстера", response.russianName());
    assertEquals(92, response.confidence());
    verify(aiTextCacheService).put(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_IDENTIFY_TEXT), eq(runtime.analyticsModelKey()), any(), any(OpenRouterIdentifyResponse.class));
  }

  @Test
  void diagnosePlantReturnsDegradedResponseWhenAllVisionModelsFail() {
    OpenRouterVisionService service = new OpenRouterVisionService(
        objectMapper,
        aiTextCacheService,
        aiProviderSettingsService,
        aiExecutionService,
        openRouterModelCatalogService
    );
    User user = new User();
    user.setId(7L);

    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENROUTER,
        AiCapability.VISION,
        "google/gemma-3-27b-it:free",
        "key",
        null,
        null,
        null,
        true
    );
    when(aiProviderSettingsService.resolveVisionRuntime(user)).thenReturn(runtime);
    when(aiTextCacheService.find(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_DIAGNOSIS_TEXT), eq(runtime.analyticsModelKey()), any(), eq(OpenRouterDiagnoseResponse.class)))
        .thenReturn(new AiTextCacheService.CacheLookupResult<>(AiTextCacheService.CacheStatus.MISS, "k", "h", null, null));
    when(openRouterModelCatalogService.resolveConfiguredPhotoFallback()).thenReturn("google/gemma-3-12b-it:free");
    when(openRouterModelCatalogService.resolveDynamicPhotoFallback(user)).thenReturn("google/gemma-3-4b-it:free");
    when(openRouterModelCatalogService.fetchModels(user)).thenReturn(List.of(
        new OpenRouterModelOptionResponse("google/gemma-3-12b-it:free", "g12", null, null, null, true, true),
        new OpenRouterModelOptionResponse("google/gemma-3-4b-it:free", "g4", null, null, null, true, true)
    ));
    when(aiExecutionService.execute(any(AiProviderSettingsService.RuntimeResolution.class), eq(AiRequestKind.PHOTO_DIAGNOSIS), any()))
        .thenThrow(new OpenRouterExecutionException(OpenRouterFailureType.RATE_LIMIT, true, "OpenRouter вернул rate limit"));

    OpenRouterDiagnoseResponse response = service.diagnosePlant(user, DATA_URI, "Basil", "Indoor basil");

    assertEquals("Точный диагноз временно недоступен", response.problem());
    assertEquals(15, response.confidence());
    assertTrue(response.description().contains("OpenRouter вернул rate limit"));
    verify(aiTextCacheService, never()).put(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_DIAGNOSIS_TEXT), any(), any(), any(OpenRouterDiagnoseResponse.class));
  }

  @Test
  void identifyPlantReturnsDegradedResponseWhenAllVisionModelsFail() {
    OpenRouterVisionService service = new OpenRouterVisionService(
        objectMapper,
        aiTextCacheService,
        aiProviderSettingsService,
        aiExecutionService,
        openRouterModelCatalogService
    );
    User user = new User();
    user.setId(7L);

    AiProviderSettingsService.RuntimeResolution runtime = new AiProviderSettingsService.RuntimeResolution(
        AiProviderType.OPENROUTER,
        AiCapability.VISION,
        "google/gemma-3-27b-it:free",
        "key",
        null,
        null,
        null,
        true
    );
    when(aiProviderSettingsService.resolveVisionRuntime(user)).thenReturn(runtime);
    when(aiTextCacheService.find(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_IDENTIFY_TEXT), eq(runtime.analyticsModelKey()), any(), eq(OpenRouterIdentifyResponse.class)))
        .thenReturn(new AiTextCacheService.CacheLookupResult<>(AiTextCacheService.CacheStatus.MISS, "k", "h", null, null));
    when(openRouterModelCatalogService.resolveConfiguredPhotoFallback()).thenReturn("google/gemma-3-12b-it:free");
    when(openRouterModelCatalogService.resolveDynamicPhotoFallback(user)).thenReturn("google/gemma-3-4b-it:free");
    when(openRouterModelCatalogService.fetchModels(user)).thenReturn(List.of(
        new OpenRouterModelOptionResponse("google/gemma-3-12b-it:free", "g12", null, null, null, true, true),
        new OpenRouterModelOptionResponse("google/gemma-3-4b-it:free", "g4", null, null, null, true, true)
    ));
    when(aiExecutionService.execute(any(AiProviderSettingsService.RuntimeResolution.class), eq(AiRequestKind.PHOTO_IDENTIFY), any()))
        .thenThrow(new OpenRouterExecutionException(OpenRouterFailureType.RATE_LIMIT, true, "OpenRouter вернул rate limit"));

    OpenRouterIdentifyResponse response = service.identifyPlant(user, DATA_URI);

    assertEquals("Растение не определено", response.russianName());
    assertEquals(10, response.confidence());
    assertTrue(response.shortDescription().contains("OpenRouter вернул rate limit"));
    verify(aiTextCacheService, never()).put(eq(7L), eq(null), eq(AiTextFeatureType.PLANT_IDENTIFY_TEXT), any(), any(), any(OpenRouterIdentifyResponse.class));
  }
}
