package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.persistence.DefaultRecommendationPersistencePolicy;
import com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.util.LearningInfo;
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
import java.time.LocalDate;
import java.util.List;
import java.util.OptionalDouble;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScheduledWateringRecalculationServiceTest {

  @Mock
  private PlantService plantService;
  @Mock
  private LearningService learningService;
  @Mock
  private OptionalSensorContextService optionalSensorContextService;
  @Mock
  private WateringRecommendationEngine recommendationEngine;
  @Mock
  private RecommendationFacade recommendationFacade;
  @Mock
  private RecommendationSnapshotService recommendationSnapshotService;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;

  private ScheduledWateringRecalculationService service;

  @BeforeEach
  void setUp() {
    PlantRecommendationContextMapper mapper = new PlantRecommendationContextMapper(
        new RecommendationContextMapperSupport(),
        new LocationContextResolver(),
        new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter())
    );
    service = new ScheduledWateringRecalculationService(
        plantService,
        learningService,
        optionalSensorContextService,
        recommendationEngine,
        mapper,
        recommendationFacade,
        new PreviewRecommendationResponseAdapter(),
        new RecommendationExplainabilityPersistenceMapper(new ObjectMapper()),
        new DefaultRecommendationPersistencePolicy(),
        new RecommendationPersistencePlanApplier(),
        recommendationSnapshotService,
        outdoorWeatherContextService,
        new ObjectMapper()
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
            22.0,
            55.0,
            1.0,
            4.0,
            26.0,
            null,
            WeatherConfidence.HIGH,
            List.of()
        )
    );
    when(plantService.save(any(Plant.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(recommendationSnapshotService.getLatestForPlant(any())).thenReturn(null);
  }

  @Test
  void buildScheduledContextUsesScheduledProfile() {
    Plant plant = plant();
    User user = plant.getUser();
    when(learningService.getAverageInterval(plant)).thenReturn(OptionalDouble.of(3.0));
    when(learningService.getSmoothedInterval(plant)).thenReturn(OptionalDouble.of(4.0));
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext());

    RecommendationRequestContext context = service.buildScheduledContext(plant, user);

    assertEquals(com.example.plantbot.service.recommendation.model.RecommendationFlowType.SCHEDULED_RECALCULATION, context.flowType());
    assertEquals(RecommendationExecutionMode.HYBRID, context.mode());
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    assertTrue(context.allowPersistence());
    assertNotNull(context.weatherContext());
    assertNotNull(context.sensorContext());
    assertNotNull(context.learningContext());
  }

  @Test
  void scheduledRecalculationUsesFacadeAndWritesSnapshotThroughPolicyPayload() {
    Plant plant = plant();
    User user = plant.getUser();
    when(plantService.listAll()).thenReturn(List.of(plant));
    when(learningService.getAverageInterval(plant)).thenReturn(OptionalDouble.of(3.0));
    when(learningService.getSmoothedInterval(plant)).thenReturn(OptionalDouble.of(4.0));
    when(optionalSensorContextService.resolveForPlant(user, plant)).thenReturn(sensorContext());
    when(recommendationFacade.scheduled(any())).thenReturn(
        new RecommendationResult(
            3,
            480,
            RecommendationSource.HYBRID.name(),
            RecommendationExecutionMode.HYBRID,
            0.82,
            new com.example.plantbot.service.recommendation.model.RecommendationExplainability(
                RecommendationSource.HYBRID.name(),
                RecommendationExecutionMode.HYBRID,
                "Scheduled summary",
                List.of("r1"),
                List.of("w1"),
                List.of(),
                null,
                null,
                null,
                null,
                null
            ),
            null,
            sensorContext(),
            Instant.now(),
            false
        )
    );
    when(recommendationEngine.recommendForExistingPlant(user, plant)).thenReturn(
        new WateringRecommendationResponse(
            RecommendationSource.HYBRID,
            PlantEnvironmentType.OUTDOOR_GARDEN,
            470,
            3,
            470,
            com.example.plantbot.domain.WateringMode.STANDARD,
            0.80,
            "Legacy scheduled summary",
            List.of(),
            List.of(),
            true,
            null,
            null,
            sensorContext()
        )
    );

    service.scheduledRecalculation();

    verify(recommendationFacade).scheduled(any(RecommendationRequestContext.class));
    verify(recommendationEngine).recommendForExistingPlant(user, plant);
    verify(plantService).save(eq(plant));
    verify(recommendationSnapshotService).saveFromPayload(eq(plant), any());
    assertEquals(3, plant.getBaseIntervalDays());
    assertEquals(480, plant.getPreferredWaterMl());
    assertEquals(RecommendationSource.HYBRID, plant.getRecommendationSource());
  }

  private Plant plant() {
    User user = new User();
    user.setId(2L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");

    Plant plant = new Plant();
    plant.setId(20L);
    plant.setUser(user);
    plant.setName("Tomato");
    plant.setCategory(PlantCategory.OUTDOOR_GARDEN);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_GARDEN);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(500);
    plant.setOutdoorAreaM2(3.0);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setLastWateredDate(LocalDate.now().minusDays(2));
    plant.setGeneratedAt(Instant.now().minusSeconds(60 * 60 * 25));
    plant.setWeatherAdjustmentEnabled(true);
    plant.setAiWateringEnabled(true);
    return plant;
  }

  private WateringSensorContextDto sensorContext() {
    return new WateringSensorContextDto(
        true,
        "room-1",
        "Garden",
        24.0,
        50.0,
        38.0,
        800.0,
        SensorConfidence.HIGH,
        "HOME_ASSISTANT",
        List.of("sensor.soil"),
        "ok"
    );
  }
}
