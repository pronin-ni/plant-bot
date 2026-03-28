package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.PlantAiRecommendRequest;
import com.example.plantbot.controller.dto.PlantAiRecommendResponse;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LegacyPlantAiRecommendMapperTest {

  @Mock
  private WeatherContextResolver weatherContextResolver;

  @Test
  void legacyRequestMapsIntoUnifiedContext() {
    LegacyPlantAiRecommendContextMapper requestMapper = new LegacyPlantAiRecommendContextMapper(
        new RecommendationContextMapperSupport(),
        weatherContextResolver
    );

    User user = new User();
    user.setId(1L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");

    when(weatherContextResolver.resolve(eq(user), any(), eq(com.example.plantbot.service.recommendation.model.RecommendationFlowType.PREVIEW)))
        .thenReturn(new WeatherContext(true, false, false, false, "OPEN_METEO", "Moscow", 20.0, 60.0, 1.0, 2.0, 25.0, null, "HIGH", List.of()));

    PlantAiRecommendRequest request = new PlantAiRecommendRequest(
        "Tomato",
        PlantEnvironmentType.OUTDOOR_GARDEN,
        null,
        PlantType.DEFAULT,
        5,
        3.0,
        40.0,
        120.0,
        "OPEN_GROUND",
        "FLOWERING",
        true,
        "LOAMY",
        "FULL_SUN",
        "Moscow region",
        true,
        true
    );

    RecommendationRequestContext context = requestMapper.map(user, request);

    assertEquals("Tomato", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_GARDEN, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, context.environmentType());
    assertEquals(RecommendationExecutionMode.AI, context.mode());
    assertEquals(5, context.baseIntervalDays());
    assertEquals(3.0, context.potVolumeLiters());
    assertEquals(PlantContainerType.OPEN_GROUND, context.containerType());
    assertEquals(PlantGrowthStage.FLOWERING, context.growthStage());
    assertTrue(Boolean.TRUE.equals(context.greenhouse()));
    assertTrue(Boolean.TRUE.equals(context.mulched()));
    assertTrue(Boolean.TRUE.equals(context.dripIrrigation()));
    assertNotNull(context.locationContext());
    assertNotNull(context.weatherContext());
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertFalse(context.allowPersistence());
  }

  @Test
  void unifiedResultMapsBackIntoLegacyResponseDto() {
    LegacyPlantAiRecommendContextMapper requestMapper = new LegacyPlantAiRecommendContextMapper(
        new RecommendationContextMapperSupport(),
        weatherContextResolver
    );
    LegacyPlantAiRecommendResponseAdapter responseAdapter = new LegacyPlantAiRecommendResponseAdapter();
    User user = new User();
    user.setId(1L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    when(weatherContextResolver.resolve(eq(user), any(), eq(com.example.plantbot.service.recommendation.model.RecommendationFlowType.PREVIEW)))
        .thenReturn(new WeatherContext(true, false, false, false, "OPEN_METEO", "Moscow", 20.0, 60.0, 1.0, 2.0, 25.0, null, "HIGH", List.of()));
    PlantAiRecommendRequest request = new PlantAiRecommendRequest(
        "Tomato",
        PlantEnvironmentType.OUTDOOR_GARDEN,
        null,
        PlantType.DEFAULT,
        5,
        3.0,
        40.0,
        120.0,
        "OPEN_GROUND",
        "FLOWERING",
        true,
        "LOAMY",
        "FULL_SUN",
        "Moscow region",
        true,
        true
    );

    RecommendationRequestContext context = requestMapper.map(user, request);

    RecommendationResult result = new RecommendationResult(
        4,
        700,
        "AI",
        RecommendationExecutionMode.AI,
        0.84,
        new RecommendationExplainability(
            "AI",
            RecommendationExecutionMode.AI,
            "Сводка AI",
            List.of("Причина 1", "Причина 2"),
            List.of("Предупреждение"),
            List.of(new RecommendationFactor("PROFILE", "Profile", "OUTDOOR_GARDEN", null, true)),
            null, null, null, null, null
        ),
        null,
        null,
        Instant.now(),
        false
    );

    PlantAiRecommendResponse response = responseAdapter.adapt(result, context);

    assertEquals("AI", response.source());
    assertEquals(4, response.recommendedIntervalDays());
    assertEquals(700, response.recommendedWaterMl());
    assertEquals("Сводка AI", response.summary());
    assertEquals(2, response.reasoning().size());
    assertEquals(1, response.warnings().size());
    assertEquals("OUTDOOR_GARDEN", response.profile());
  }
}
