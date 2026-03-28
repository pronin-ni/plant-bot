package com.example.plantbot.service;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.SeedRecommendationService;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.ha.HomeAssistantIntegrationService;
import com.example.plantbot.service.recommendation.facade.DefaultRecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.mapper.RecommendationResultMapper;
import com.example.plantbot.service.recommendation.mapper.RuntimeRecommendationAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
import com.example.plantbot.util.WateringRecommendation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

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
@MockitoSettings(strictness = Strictness.LENIENT)
class WateringRecommendationQuickFlowTest {

  @Mock
  private WeatherService weatherService;
  @Mock
  private LearningService learningService;
  @Mock
  private OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  @Mock
  private HomeAssistantIntegrationService haIntegrationService;
  @Mock
  private OptionalSensorContextService optionalSensorContextService;
  @Mock
  private com.example.plantbot.service.recommendation.facade.RecommendationFacade recommendationFacade;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private WateringRecommendationEngine recommendationEngine;
  @Mock
  private SeedRecommendationService seedRecommendationService;
  @Mock
  private LocationContextResolver locationContextResolver;
  @Mock
  private WeatherContextResolver weatherContextResolver;

  private WateringRecommendationService service;

  @BeforeEach
  void setUp() {
    RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
    LocationContextResolver locationResolver = new LocationContextResolver();
    WeatherContextResolver weatherResolver = new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter());
    PlantRecommendationContextMapper plantMapper = new PlantRecommendationContextMapper(support, locationResolver, weatherResolver);
    service = new WateringRecommendationService(
        learningService,
        optionalSensorContextService,
        plantMapper,
        recommendationFacade,
        new RuntimeRecommendationAdapter(),
        locationContextResolver,
        weatherContextResolver
    );

    when(learningService.getAverageInterval(any())).thenReturn(java.util.OptionalDouble.of(3.5));
    when(learningService.getSmoothedInterval(any())).thenReturn(java.util.OptionalDouble.of(4.0));
    when(outdoorWeatherContextService.resolve(any(), nullable(String.class), nullable(String.class))).thenReturn(
        new NormalizedWeatherContext(true, false, false, false, null, "Moscow", "Moscow region", null, null, null, null, null, null, null, List.of())
    );
    when(locationContextResolver.resolveForPlant(any(), any())).thenCallRealMethod();
    when(weatherContextResolver.resolve(any(), any(), any())).thenReturn(
        new com.example.plantbot.service.recommendation.model.WeatherContext(
            true, false, false, false, "OPEN_METEO", "Moscow", 20.0, 60.0, 1.0, 2.0, 25.0, null, "HIGH", List.of()
        )
    );
  }

  @Test
  void quickContextBuilderProducesLightweightContextWithoutWeatherAndSensorResolution() {
    Plant plant = plant();
    User user = user();

    RecommendationRequestContext context = service.buildQuickContext(plant, user);

    assertEquals(plant.getId(), context.plantId());
    assertEquals("Quick plant", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_GARDEN, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, context.environmentType());
    assertTrue(Boolean.TRUE.equals(context.perennial()));
    assertTrue(Boolean.TRUE.equals(context.winterDormancyEnabled()));
    assertNotNull(context.learningContext());
    assertNotNull(context.seasonContext());
    assertNull(context.weatherContext());
    assertNull(context.sensorContext());
    assertFalse(context.allowAI());
    assertFalse(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    verify(optionalSensorContextService, org.mockito.Mockito.never()).resolveForPlant(any(), any());
  }

  @Test
  void quickAdapterMapsUnifiedResultBackToLegacyType() {
    RuntimeRecommendationAdapter adapter = new RuntimeRecommendationAdapter();
    WateringRecommendation recommendation = adapter.adapt(
        new RecommendationResult(
            4,
            650,
            RecommendationSource.HEURISTIC.name(),
            com.example.plantbot.service.recommendation.model.RecommendationExecutionMode.HEURISTIC,
            null,
            null,
            null,
            null,
            Instant.now(),
            false
        )
    );

    assertEquals(4.0, recommendation.intervalDays());
    assertEquals(0.65, recommendation.waterLiters());
  }

  @Test
  void publicRecommendQuickRoutesThroughFacadeAndPreservesLegacyContract() {
    Plant plant = plant();
    User user = user();
    when(recommendationFacade.runtime(any())).thenReturn(
        new RecommendationResult(
            5,
            700,
            RecommendationSource.HEURISTIC.name(),
            com.example.plantbot.service.recommendation.model.RecommendationExecutionMode.HEURISTIC,
            null,
            null,
            null,
            null,
            Instant.now(),
            false
        )
    );

    WateringRecommendation recommendation = service.recommendQuick(plant, user);

    ArgumentCaptor<RecommendationRequestContext> contextCaptor = ArgumentCaptor.forClass(RecommendationRequestContext.class);
    verify(recommendationFacade).runtime(contextCaptor.capture());
    RecommendationRequestContext context = contextCaptor.getValue();
    assertFalse(context.allowAI());
    assertFalse(context.allowWeather());
    assertTrue(context.allowLearning());
    assertTrue(context.allowSensors());
    assertFalse(context.allowPersistence());
    assertEquals(5.0, recommendation.intervalDays());
    assertEquals(0.7, recommendation.waterLiters());
  }

  @Test
  void quickFacadeProducesCompactButValidExplainability() {
    LegacyRuntimeRecommendationDelegate delegate = org.mockito.Mockito.mock(LegacyRuntimeRecommendationDelegate.class);
    DefaultRecommendationFacade facade = new DefaultRecommendationFacade(
        recommendationEngine,
        seedRecommendationService,
        new RecommendationResultMapper(),
        delegate
    );
    RecommendationRequestContext context = service.buildQuickContext(plant(), user());
    when(delegate.recommendQuick(any(Plant.class), any(User.class))).thenReturn(new WateringRecommendation(4.0, 0.6));

    RecommendationResult result = facade.runtime(context);

    assertEquals(com.example.plantbot.service.recommendation.model.RecommendationExecutionMode.HEURISTIC, result.mode());
    assertNotNull(result.explainability());
    assertEquals("Быстрая рекомендация рассчитана по локальным эвристикам и истории полива.", result.explainability().summary());
    assertTrue(result.explainability().reasoning().stream().anyMatch(item -> item.contains("быстрый профиль")));
    assertTrue(result.explainability().warnings().stream().anyMatch(item -> item.contains("Быстрый режим")));
  }

  private Plant plant() {
    Plant plant = new Plant();
    plant.setId(101L);
    plant.setName("Quick plant");
    plant.setCategory(PlantCategory.OUTDOOR_GARDEN);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_GARDEN);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(600);
    plant.setRecommendedIntervalDays(3);
    plant.setRecommendedWaterVolumeMl(550);
    plant.setOutdoorAreaM2(3.0);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setMulched(true);
    plant.setPerennial(true);
    plant.setWinterDormancyEnabled(true);
    plant.setCity("Moscow");
    plant.setRegion("Moscow region");
    plant.setLastWateredDate(LocalDate.now().minusDays(2));
    return plant;
  }

  private User user() {
    User user = new User();
    user.setId(11L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);
    return user;
  }
}
