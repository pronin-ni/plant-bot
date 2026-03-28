package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.service.SeedRecommendationService;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.ha.HomeAssistantIntegrationService;
import com.example.plantbot.service.recommendation.facade.DefaultRecommendationFacade;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
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
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WateringRecommendationRuntimeFlowTest {

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
  private RecommendationFacade recommendationFacade;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private WateringRecommendationEngine recommendationEngine;
  @Mock
  private SeedRecommendationService seedRecommendationService;

  private RuntimeRecommendationAdapter runtimeRecommendationAdapter;
  private WateringRecommendationService service;
  private PlantRecommendationContextMapper plantMapper;

  @BeforeEach
  void setUp() {
    runtimeRecommendationAdapter = new RuntimeRecommendationAdapter();
    RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
    LocationContextResolver locationResolver = new LocationContextResolver();
    WeatherContextResolver weatherResolver = new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter());
    plantMapper = new PlantRecommendationContextMapper(support, locationResolver, weatherResolver);

    service = new WateringRecommendationService(
        weatherService,
        learningService,
        openRouterPlantAdvisorService,
        haIntegrationService,
        optionalSensorContextService,
        plantMapper,
        recommendationFacade,
        runtimeRecommendationAdapter
    );

    when(outdoorWeatherContextService.resolve(any(), nullable(String.class), nullable(String.class))).thenReturn(
        new NormalizedWeatherContext(
            true,
            false,
            false,
            false,
            WeatherProvider.OPEN_METEO,
            "Moscow",
            "Moscow region",
            22.5,
            58.0,
            1.0,
            4.0,
            27.0,
            null,
            WeatherConfidence.HIGH,
            List.of()
        )
    );
  }

  @Test
  void buildRuntimeContextCarriesPlantWeatherLearningRelevantState() {
    Plant plant = runtimePlant();
    User user = runtimeUser();
    WateringSensorContextDto sensorContext = sensorContext();
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext);

    RecommendationRequestContext context = service.buildRuntimeContext(plant, user);

    assertEquals(plant.getId(), context.plantId());
    assertEquals("Runtime plant", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_GARDEN, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, context.environmentType());
    assertEquals(plant.getBaseIntervalDays(), context.baseIntervalDays());
    assertEquals(plant.getPreferredWaterMl(), context.preferredWaterMl());
    assertEquals(plant.getRecommendedIntervalDays(), context.recommendedIntervalDays());
    assertEquals(plant.getRecommendedWaterVolumeMl(), context.recommendedWaterVolumeMl());
    assertEquals(plant.getOutdoorAreaM2(), context.outdoorAreaM2());
    assertEquals(OutdoorSoilType.LOAMY, context.outdoorSoilType());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertTrue(Boolean.TRUE.equals(context.perennial()));
    assertTrue(Boolean.TRUE.equals(context.winterDormancyEnabled()));
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    assertFalse(context.allowPersistence());
    assertNotNull(context.weatherContext());
    assertSame(sensorContext, context.sensorContext());
  }

  @Test
  void runtimeFacadeUsesLegacyDelegateAndReturnsUnifiedResult() {
    LegacyRuntimeRecommendationDelegate delegate = org.mockito.Mockito.mock(LegacyRuntimeRecommendationDelegate.class);
    DefaultRecommendationFacade facade = new DefaultRecommendationFacade(
        recommendationEngine,
        seedRecommendationService,
        new RecommendationResultMapper(),
        delegate
    );
    RecommendationRequestContext context = plantMapper.mapForRefresh(runtimePlant(), runtimeUser(), sensorContext());
    when(delegate.recommendProfile(any(Plant.class), any(User.class), eq(true), eq(true), eq(true)))
        .thenReturn(new WateringRecommendation(4.7, 0.55));

    RecommendationResult result = facade.runtime(context);

    assertEquals(4, result.recommendedIntervalDays());
    assertEquals(550, result.recommendedWaterMl());
    assertNotNull(result.explainability());
    assertEquals("Рекомендация рассчитана с учётом ручной настройки полива.", result.explainability().summary());
    assertTrue(result.explainability().reasoning().stream().anyMatch(item -> item.contains("Базовый интервал")));
    assertTrue(result.explainability().reasoning().stream().anyMatch(item -> item.contains("Активна ручная настройка")));
    assertEquals(null, result.explainability().learningContribution());
    assertEquals("Используется ручная настройка полива.", result.explainability().manualOverrideContribution());
    assertEquals(context.weatherContext(), result.weatherContext());
    assertSame(context.sensorContext(), result.sensorContext());
    ArgumentCaptor<Plant> plantCaptor = ArgumentCaptor.forClass(Plant.class);
    verify(delegate).recommendProfile(plantCaptor.capture(), any(User.class), eq(true), eq(true), eq(true));
    assertTrue(Boolean.TRUE.equals(plantCaptor.getValue().getPerennial()));
    assertTrue(Boolean.TRUE.equals(plantCaptor.getValue().getWinterDormancyEnabled()));
  }

  @Test
  void runtimeAdapterMapsUnifiedResultBackToLegacyRuntimeType() {
    WateringRecommendation recommendation = runtimeRecommendationAdapter.adapt(
        new RecommendationResult(
            6,
            750,
            RecommendationSource.HYBRID.name(),
            com.example.plantbot.service.recommendation.model.RecommendationExecutionMode.HYBRID,
            null,
            null,
            null,
            null,
            Instant.now(),
            false
        )
    );

    assertEquals(6.0, recommendation.intervalDays());
    assertEquals(0.75, recommendation.waterLiters());
  }

  @Test
  void recommendMethodRoutesThroughFacadeAndPreservesLegacyContract() {
    Plant plant = runtimePlant();
    User user = runtimeUser();
    WateringSensorContextDto sensorContext = sensorContext();
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext);
    when(recommendationFacade.runtime(any())).thenReturn(
        new RecommendationResult(
            5,
            620,
            RecommendationSource.HYBRID.name(),
            com.example.plantbot.service.recommendation.model.RecommendationExecutionMode.HYBRID,
            null,
            null,
            null,
            sensorContext,
            Instant.now(),
            false
        )
    );

    WateringRecommendation recommendation = service.recommend(plant, user);

    ArgumentCaptor<RecommendationRequestContext> contextCaptor = ArgumentCaptor.forClass(RecommendationRequestContext.class);
    verify(recommendationFacade).runtime(contextCaptor.capture());
    RecommendationRequestContext context = contextCaptor.getValue();
    assertEquals(plant.getId(), context.plantId());
    assertSame(sensorContext, context.sensorContext());
    assertEquals(5.0, recommendation.intervalDays());
    assertEquals(0.62, recommendation.waterLiters());
  }

  private Plant runtimePlant() {
    Plant plant = new Plant();
    plant.setId(91L);
    plant.setName("Runtime plant");
    plant.setCategory(PlantCategory.OUTDOOR_GARDEN);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_GARDEN);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(550);
    plant.setRecommendedIntervalDays(3);
    plant.setRecommendedWaterVolumeMl(500);
    plant.setManualWaterVolumeMl(500);
    plant.setManualOverrideActive(true);
    plant.setRecommendationSource(RecommendationSource.MANUAL);
    plant.setGeneratedAt(Instant.parse("2026-03-28T12:00:00Z"));
    plant.setOutdoorAreaM2(3.0);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setMulched(true);
    plant.setPerennial(true);
    plant.setWinterDormancyEnabled(true);
    plant.setContainerType(PlantContainerType.OPEN_GROUND);
    plant.setContainerVolumeLiters(20.0);
    plant.setCity("Moscow");
    plant.setRegion("Moscow region");
    plant.setWeatherAdjustmentEnabled(true);
    plant.setAiWateringEnabled(true);
    plant.setLastWateredDate(LocalDate.now().minusDays(2));
    return plant;
  }

  private User runtimeUser() {
    User user = new User();
    user.setId(12L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);
    return user;
  }

  private WateringSensorContextDto sensorContext() {
    return new WateringSensorContextDto(
        true,
        "room-1",
        "Garden",
        24.0,
        48.0,
        36.0,
        900.0,
        SensorConfidence.HIGH,
        "HOME_ASSISTANT",
        List.of("sensor.soil"),
        "ok"
    );
  }
}
