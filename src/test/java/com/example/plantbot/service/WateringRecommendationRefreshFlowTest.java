package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WateringMode;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.service.SeedRecommendationService;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.facade.DefaultRecommendationFacade;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.mapper.RecommendationResultMapper;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
import com.example.plantbot.util.WateringRecommendation;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.persistence.DefaultRecommendationPersistencePolicy;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WateringRecommendationRefreshFlowTest {

  @Mock
  private WateringRecommendationEngine recommendationEngine;
  @Mock
  private PlantService plantService;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private RecommendationSnapshotService recommendationSnapshotService;
  @Mock
  private AiTextCacheInvalidationService aiTextCacheInvalidationService;
  @Mock
  private OptionalSensorContextService optionalSensorContextService;
  @Mock
  private LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate;
  @Mock
  private SeedRecommendationService seedRecommendationService;

  private WateringRecommendationPreviewService service;

  @BeforeEach
  void setUp() {
    RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
    LocationContextResolver locationResolver = new LocationContextResolver();
    WeatherContextResolver weatherResolver = new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter());
    PreviewRecommendationContextMapper previewMapper = new PreviewRecommendationContextMapper(support, locationResolver, weatherResolver);
    PlantRecommendationContextMapper plantMapper = new PlantRecommendationContextMapper(support, locationResolver, weatherResolver);
    RecommendationFacade facade = new DefaultRecommendationFacade(
        recommendationEngine,
        seedRecommendationService,
        new RecommendationResultMapper(),
        legacyRuntimeRecommendationDelegate
    );

    service = new WateringRecommendationPreviewService(
        recommendationEngine,
        plantService,
        outdoorWeatherContextService,
        recommendationSnapshotService,
        aiTextCacheInvalidationService,
        optionalSensorContextService,
        previewMapper,
        plantMapper,
        facade,
        new PreviewRecommendationResponseAdapter(),
        new RecommendationExplainabilityPersistenceMapper(new ObjectMapper()),
        new DefaultRecommendationPersistencePolicy(),
        new RecommendationPersistencePlanApplier(),
        new ObjectMapper()
    );

    lenient().when(outdoorWeatherContextService.resolve(any(), nullable(String.class), nullable(String.class))).thenReturn(
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
            1.2,
            5.5,
            27.0,
            null,
            WeatherConfidence.HIGH,
            List.of("Weather warning")
        )
    );
    when(plantService.save(any(Plant.class))).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void buildRefreshContextMapsExistingPlantWeatherAndSensorState() {
    User user = user();
    Plant plant = plant();
    WateringSensorContextDto sensorContext = sensorContext();
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext);

    RecommendationRequestContext context = service.buildRefreshContext(user, plant);

    assertEquals(plant.getId(), context.plantId());
    assertEquals("Rose", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_DECORATIVE, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_ORNAMENTAL, context.environmentType());
    assertEquals(plant.getBaseIntervalDays(), context.baseIntervalDays());
    assertEquals(plant.getPreferredWaterMl(), context.preferredWaterMl());
    assertEquals(plant.getRecommendedIntervalDays(), context.recommendedIntervalDays());
    assertEquals(plant.getRecommendedWaterVolumeMl(), context.recommendedWaterVolumeMl());
    assertTrue(context.manualOverrideActive());
    assertEquals(PlantContainerType.CONTAINER, context.containerType());
    assertEquals(12.0, context.containerVolumeLiters());
    assertEquals(OutdoorSoilType.LOAMY, context.outdoorSoilType());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertNotNull(context.weatherContext());
    assertEquals("OPEN_METEO", context.weatherContext().providerUsed());
    assertSame(sensorContext, context.sensorContext());
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertTrue(context.allowSensors());
  }

  @Test
  void refreshForExistingPlantRoutesThroughFacadeAndPreservesRefreshFields() {
    User user = user();
    Plant plant = plant();
    WateringSensorContextDto sensorContext = sensorContext();
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext);
    when(legacyRuntimeRecommendationDelegate.recommendProfile(any(Plant.class), any(User.class), eq(true), eq(true), eq(true)))
        .thenReturn(new WateringRecommendation(3.0, 0.43));

    WateringRecommendationResponse response = service.refreshForExistingPlant(user, plant);

    ArgumentCaptor<Plant> plantCaptor = ArgumentCaptor.forClass(Plant.class);
    ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
    verify(legacyRuntimeRecommendationDelegate).recommendProfile(plantCaptor.capture(), userCaptor.capture(), eq(true), eq(true), eq(true));

    Plant forwarded = plantCaptor.getValue();
    assertEquals("Rose", forwarded.getName());
    assertEquals(PlantEnvironmentType.OUTDOOR_ORNAMENTAL, forwarded.getWateringProfile());
    assertEquals(PlantContainerType.CONTAINER, forwarded.getContainerType());
    assertEquals(SunExposure.FULL_SUN, forwarded.getSunExposure());
    assertEquals(OutdoorSoilType.LOAMY, forwarded.getOutdoorSoilType());
    assertEquals("Moscow", forwarded.getCity());
    assertEquals("Moscow region", forwarded.getRegion());
    assertSame(user.getId(), userCaptor.getValue().getId());
    assertEquals(RecommendationSource.MANUAL, response.source());
    assertNotNull(response.weatherContextPreview());
  }

  @Test
  void refreshForExistingPlantUpdatesPlantAndWritesSnapshotWithoutBaselineRewrite() {
    User user = user();
    Plant plant = plant();
    Integer originalBaseInterval = plant.getBaseIntervalDays();
    Integer originalPreferredWater = plant.getPreferredWaterMl();
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext());
    when(legacyRuntimeRecommendationDelegate.recommendProfile(any(Plant.class), any(User.class), eq(true), eq(true), eq(true)))
        .thenReturn(new WateringRecommendation(3.0, 0.43));

    service.refreshForExistingPlant(user, plant);

    assertEquals(3, plant.getRecommendedIntervalDays());
    assertEquals(430, plant.getRecommendedWaterVolumeMl());
    assertEquals(RecommendationSource.MANUAL, plant.getRecommendationSource());
    assertEquals("Рекомендация рассчитана с учётом ручной настройки полива.", plant.getRecommendationSummary());
    assertNotNull(plant.getRecommendationReasoningJson());
    assertNotNull(plant.getRecommendationWarningsJson());
    assertEquals(null, plant.getConfidenceScore());
    assertTrue(Boolean.TRUE.equals(plant.getManualOverrideActive()));
    assertEquals(430, plant.getManualWaterVolumeMl());
    assertEquals(originalBaseInterval, plant.getBaseIntervalDays());
    assertEquals(originalPreferredWater, plant.getPreferredWaterMl());
    verify(plantService).save(eq(plant));
    verify(recommendationSnapshotService).saveFromResponse(eq(plant), any(WateringRecommendationResponse.class));
  }

  private User user() {
    User user = new User();
    user.setId(41L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);
    return user;
  }

  private Plant plant() {
    Plant plant = new Plant();
    plant.setId(77L);
    plant.setName("Rose");
    plant.setCategory(PlantCategory.OUTDOOR_DECORATIVE);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_ORNAMENTAL);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setWateringProfileType(WateringProfileType.OUTDOOR_ORNAMENTAL);
    plant.setPlantPlacementType(com.example.plantbot.domain.PlantPlacementType.OUTDOOR);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(360);
    plant.setRecommendedIntervalDays(2);
    plant.setRecommendedWaterVolumeMl(410);
    plant.setManualWaterVolumeMl(390);
    plant.setManualOverrideActive(true);
    plant.setRecommendationSource(RecommendationSource.MANUAL);
    plant.setGeneratedAt(Instant.parse("2026-03-28T10:00:00Z"));
    plant.setContainerType(PlantContainerType.CONTAINER);
    plant.setContainerVolumeLiters(12.0);
    plant.setOutdoorAreaM2(1.5);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setGrowthStage(PlantGrowthStage.FLOWERING);
    plant.setGreenhouse(false);
    plant.setMulched(true);
    plant.setDripIrrigation(false);
    plant.setCity("Moscow");
    plant.setRegion("Moscow region");
    plant.setWeatherAdjustmentEnabled(true);
    plant.setAiWateringEnabled(true);
    return plant;
  }

  private WateringSensorContextDto sensorContext() {
    return new WateringSensorContextDto(
        true,
        "room-1",
        "Terrace",
        23.0,
        55.0,
        44.0,
        700.0,
        SensorConfidence.HIGH,
        "HOME_ASSISTANT",
        List.of("sensor.soil"),
        "ok"
    );
  }

  private WateringRecommendationResponse refreshResponse() {
    return new WateringRecommendationResponse(
        RecommendationSource.HYBRID,
        PlantEnvironmentType.OUTDOOR_ORNAMENTAL,
        430,
        3,
        430,
        WateringMode.STANDARD,
        0.79,
        "Refresh summary",
        List.of("reason-1"),
        List.of("warning-1"),
        true,
        new WeatherContextPreviewResponse(
            true,
            false,
            false,
            false,
            "OPEN_METEO",
            "Moscow",
            "Moscow region",
            22.0,
            57.0,
            1.0,
            4.0,
            26.0,
            null,
            "HIGH",
            List.of("Weather warning")
        ),
        null,
        sensorContext()
    );
  }
}
