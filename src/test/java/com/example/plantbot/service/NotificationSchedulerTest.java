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
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.mapper.RuntimeRecommendationAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
import com.example.plantbot.util.LearningInfo;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NotificationSchedulerTest {

  @Mock
  private PlantRepository plantRepository;
  @Mock
  private WateringRecommendationService recommendationService;
  @Mock
  private LearningService learningService;
  @Mock
  private RecommendationFacade recommendationFacade;
  @Mock
  private LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate;
  @Mock
  private WebPushNotificationService webPushNotificationService;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;

  private NotificationScheduler scheduler;

  @BeforeEach
  void setUp() {
    RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
    PlantRecommendationContextMapper mapper = new PlantRecommendationContextMapper(
        support,
        new LocationContextResolver(),
        new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter())
    );
    scheduler = new NotificationScheduler(
        plantRepository,
        recommendationService,
        learningService,
        mapper,
        recommendationFacade,
        new RuntimeRecommendationAdapter(),
        legacyRuntimeRecommendationDelegate,
        webPushNotificationService
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
            3.0,
            26.0,
            null,
            WeatherConfidence.HIGH,
            List.of()
        )
    );
  }

  @Test
  void buildNotificationContextUsesNotificationProfile() {
    Plant plant = plant();
    User user = plant.getUser();
    when(learningService.getAverageInterval(plant)).thenReturn(OptionalDouble.of(3.0));
    when(learningService.getSmoothedInterval(plant)).thenReturn(OptionalDouble.of(4.0));

    RecommendationRequestContext context = scheduler.buildNotificationContext(plant, user);

    assertEquals(com.example.plantbot.service.recommendation.model.RecommendationFlowType.NOTIFICATION, context.flowType());
    assertEquals(RecommendationExecutionMode.WEATHER_ADJUSTED, context.mode());
    assertFalse(context.allowAI());
    assertTrue(context.allowWeather());
    assertFalse(context.allowSensors());
    assertTrue(context.allowLearning());
    assertFalse(context.allowPersistence());
    assertNotNull(context.weatherContext());
    assertNotNull(context.learningContext());
  }

  @Test
  void dailyCheckUsesFacadeAndUnifiedResultForWateringReminder() {
    Plant plant = plant();
    User user = plant.getUser();
    when(plantRepository.findAll()).thenReturn(List.of(plant));
    when(learningService.getAverageInterval(plant)).thenReturn(OptionalDouble.of(3.0));
    when(learningService.getSmoothedInterval(plant)).thenReturn(OptionalDouble.of(4.0));
    when(recommendationFacade.runtime(any())).thenReturn(new RecommendationResult(
        2,
        600,
        RecommendationSource.WEATHER_ADJUSTED.name(),
        RecommendationExecutionMode.WEATHER_ADJUSTED,
        null,
        null,
        null,
        null,
        Instant.now(),
        false
    ));
    when(legacyRuntimeRecommendationDelegate.recommendProfile(eq(plant), eq(user), eq(true), eq(false), eq(false)))
        .thenReturn(new com.example.plantbot.util.WateringRecommendation(2.0, 0.55));
    when(webPushNotificationService.sendWateringReminder(eq(plant), any(RecommendationResult.class))).thenReturn(true);

    scheduler.dailyCheck();

    ArgumentCaptor<RecommendationRequestContext> contextCaptor = ArgumentCaptor.forClass(RecommendationRequestContext.class);
    verify(recommendationFacade).runtime(contextCaptor.capture());
    assertEquals(com.example.plantbot.service.recommendation.model.RecommendationFlowType.NOTIFICATION, contextCaptor.getValue().flowType());
    verify(webPushNotificationService).sendWateringReminder(eq(plant), any(RecommendationResult.class));
    verify(plantRepository).save(eq(plant));
    verify(recommendationService, never()).recommend(any(), any());
  }

  private Plant plant() {
    User user = new User();
    user.setId(1L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    Plant plant = new Plant();
    plant.setId(10L);
    plant.setUser(user);
    plant.setName("Rose");
    plant.setCategory(PlantCategory.OUTDOOR_DECORATIVE);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_ORNAMENTAL);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(500);
    plant.setRecommendedIntervalDays(3);
    plant.setRecommendedWaterVolumeMl(450);
    plant.setOutdoorAreaM2(2.0);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setLastWateredDate(LocalDate.now().minusDays(3));
    return plant;
  }
}
