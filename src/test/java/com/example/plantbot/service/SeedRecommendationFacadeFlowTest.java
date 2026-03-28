package com.example.plantbot.service;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.SeedRecommendationPreviewResponse;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedContainerType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedSubstrateType;
import com.example.plantbot.domain.SeedWateringMode;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.facade.DefaultRecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.mapper.SeedRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.SeedRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.mapper.SeedRecommendationResultMapper;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SeedRecommendationFacadeFlowTest {

  @Mock
  private OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private WateringRecommendationEngine wateringRecommendationEngine;
  @Mock
  private LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate;

  private SeedRecommendationContextMapper seedMapper;
  private SeedRecommendationService seedService;
  private DefaultRecommendationFacade facade;
  private SeedRecommendationResponseAdapter responseAdapter;

  @BeforeEach
  void setUp() {
    seedMapper = new SeedRecommendationContextMapper(
        new RecommendationContextMapperSupport(),
        new LocationContextResolver(),
        new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter())
    );
    seedService = new SeedRecommendationService(openRouterPlantAdvisorService, new SeedRecommendationResultMapper());
    facade = new DefaultRecommendationFacade(
        wateringRecommendationEngine,
        seedService,
        new com.example.plantbot.service.recommendation.mapper.RecommendationResultMapper(),
        legacyRuntimeRecommendationDelegate
    );
    responseAdapter = new SeedRecommendationResponseAdapter();
  }

  @Test
  void seedRequestMapsToUnifiedContextAndFacadeReturnsUnifiedResult() {
    User user = new User();
    user.setId(10L);
    SeedRecommendationPreviewRequest request = new SeedRecommendationPreviewRequest(
        "Pepper",
        SeedStage.GERMINATING,
        PlantEnvironmentType.OUTDOOR_GARDEN,
        SeedContainerType.SEED_TRAY,
        SeedSubstrateType.SEED_START_MIX,
        LocalDate.of(2026, 3, 20),
        24.0,
        true,
        false,
        "Leningrad oblast"
    );
    when(openRouterPlantAdvisorService.suggestSeedRecommendation(any(), any())).thenReturn(Optional.of(
        new OpenRouterPlantAdvisorService.SeedCareRecommendation(
            "AI",
            "Поддерживайте стабильную влажность и проветривайте мини-парник.",
            12,
            SeedWateringMode.VENT_AND_MIST,
            4,
            10,
            "Семена прорастают стабильно, держите мягкий режим влажности.",
            List.of("Стадия прорастания требует проветривания.", "Контроль света остаётся мягким."),
            List.of("Не допускайте конденсата на укрытии.")
        )
    ));

    RecommendationRequestContext context = seedMapper.map(user, request);
    RecommendationResult result = facade.preview(context);

    assertEquals(RecommendationExecutionMode.AI, result.mode());
    assertEquals("AI", result.source());
    assertNotNull(result.explainability());
    assertEquals("Семена прорастают стабильно, держите мягкий режим влажности.", result.explainability().summary());
    assertTrue(result.explainability().reasoning().stream().anyMatch(item -> item.contains("проветривания")));
    assertTrue(result.explainability().factors().stream().anyMatch(item -> "CARE_MODE".equals(item.kind())));
    assertNull(result.recommendedIntervalDays());
    assertNull(result.recommendedWaterMl());
  }

  @Test
  void seedAdapterPreservesSeedSpecificFieldsInExistingDto() {
    RecommendationRequestContext context = seedMapper.map(
        user(),
        new SeedRecommendationPreviewRequest(
            "Basil",
            SeedStage.SPROUTED,
            PlantEnvironmentType.INDOOR,
            SeedContainerType.SEED_TRAY,
            SeedSubstrateType.COCO_COIR,
            LocalDate.of(2026, 3, 10),
            23.0,
            false,
            true,
            "Moscow"
        )
    );
    RecommendationResult result = new SeedRecommendationResultMapper().fromPreviewResponse(
        new SeedRecommendationPreviewResponse(
            "FALLBACK",
            SeedStage.SPROUTED,
            PlantEnvironmentType.INDOOR,
            "Лёгкое увлажнение и мягкая адаптация к свету.",
            8,
            SeedWateringMode.LIGHT_SURFACE_WATER,
            0,
            5,
            "После появления ростков снижайте риск перелива и постепенно усиливайте свет.",
            List.of("Росткам нужен свет.", "Проверяйте влажность поверхности."),
            List.of("Не переливайте кассету.")
        ),
        context
    );

    SeedRecommendationPreviewResponse response = responseAdapter.adapt(result, context);

    assertEquals("FALLBACK", response.source());
    assertEquals(SeedStage.SPROUTED, response.seedStage());
    assertEquals(PlantEnvironmentType.INDOOR, response.targetEnvironmentType());
    assertEquals("Лёгкое увлажнение и мягкая адаптация к свету.", response.careMode());
    assertEquals(8, response.recommendedCheckIntervalHours());
    assertEquals(SeedWateringMode.LIGHT_SURFACE_WATER, response.recommendedWateringMode());
    assertEquals(0, response.expectedGerminationDaysMin());
    assertEquals(5, response.expectedGerminationDaysMax());
    assertEquals("После появления ростков снижайте риск перелива и постепенно усиливайте свет.", response.summary());
    assertEquals(2, response.reasoning().size());
    assertEquals(1, response.warnings().size());
  }

  private User user() {
    User user = new User();
    user.setId(11L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    return user;
  }
}
