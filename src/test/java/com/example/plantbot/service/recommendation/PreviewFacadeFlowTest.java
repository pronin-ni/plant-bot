package com.example.plantbot.service.recommendation;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.controller.dto.WeatherContextPreviewResponse;
import com.example.plantbot.domain.GrowthStage;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacementType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WateringMode;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.service.AiTextCacheInvalidationService;
import com.example.plantbot.service.OutdoorWeatherContextService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.RecommendationSnapshotService;
import com.example.plantbot.service.SeedRecommendationService;
import com.example.plantbot.service.WateringRecommendationEngine;
import com.example.plantbot.service.WateringRecommendationPreviewService;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.facade.DefaultRecommendationFacade;
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
import com.example.plantbot.service.recommendation.persistence.DefaultRecommendationPersistencePolicy;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PreviewFacadeFlowTest {

  @Mock
  private WateringRecommendationEngine engine;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private PlantService plantService;
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

  private DefaultRecommendationFacade facade;
  private WateringRecommendationPreviewService previewService;
  private PreviewRecommendationResponseAdapter responseAdapter;
  private PreviewRecommendationContextMapper previewMapper;
  private PlantRecommendationContextMapper plantMapper;

  @BeforeEach
  void setUp() {
    RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
    LocationContextResolver locationContextResolver = new LocationContextResolver();
    WeatherContextResolver weatherContextResolver = new WeatherContextResolver(outdoorWeatherContextService, new WeatherContextAdapter());
    previewMapper = new PreviewRecommendationContextMapper(support, locationContextResolver, weatherContextResolver);
    plantMapper = new PlantRecommendationContextMapper(support, locationContextResolver, weatherContextResolver);
    facade = new DefaultRecommendationFacade(engine, seedRecommendationService, new RecommendationResultMapper(), legacyRuntimeRecommendationDelegate);
    responseAdapter = new PreviewRecommendationResponseAdapter();
    previewService = new WateringRecommendationPreviewService(
        engine,
        plantService,
        outdoorWeatherContextService,
        recommendationSnapshotService,
        aiTextCacheInvalidationService,
        optionalSensorContextService,
        previewMapper,
        plantMapper,
        facade,
        responseAdapter,
        new RecommendationExplainabilityPersistenceMapper(new ObjectMapper()),
        new DefaultRecommendationPersistencePolicy(),
        new RecommendationPersistencePlanApplier(),
        new ObjectMapper()
    );

    when(outdoorWeatherContextService.resolve(any(), nullable(String.class), nullable(String.class)))
        .thenReturn(new NormalizedWeatherContext(
            true,
            false,
            false,
            false,
            WeatherProvider.OPEN_METEO,
            "Moscow",
            "Moscow region",
            23.0,
            55.0,
            1.5,
            6.0,
            27.0,
            3.0,
            com.example.plantbot.domain.WeatherConfidence.HIGH,
            List.of("Weather warning")
        ));
  }

  @Test
  void previewServiceBuildsContextThenRoutesThroughFacadeWithPreviewFieldsIntact() {
    User user = new User();
    user.setId(17L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);

    WateringRecommendationPreviewRequest request = new WateringRecommendationPreviewRequest(
        "Tomato",
        WateringProfileType.OUTDOOR_GARDEN,
        PlantPlacementType.OUTDOOR,
        500,
        true,
        true,
        null,
        PlantEnvironmentType.OUTDOOR_GARDEN,
        null,
        3,
        null,
        null,
        null,
        null,
        "tomato",
        "FLOWERING",
        GrowthStage.FLOWERING,
        true,
        true,
        true,
        4.0,
        SoilType.LOAMY,
        SunlightExposure.HIGH,
        "room-1",
        "Greenhouse",
        "sensor.temp",
        "sensor.humidity",
        "sensor.soil",
        "sensor.lux",
        null,
        RecommendationMode.AI
    );

    when(engine.recommendPreview(any(), any())).thenReturn(previewResponse());

    WateringRecommendationResponse response = previewService.preview(user, request);

    ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
    ArgumentCaptor<WateringRecommendationPreviewRequest> requestCaptor = ArgumentCaptor.forClass(WateringRecommendationPreviewRequest.class);
    verify(engine).recommendPreview(userCaptor.capture(), requestCaptor.capture());

    WateringRecommendationPreviewRequest forwarded = requestCaptor.getValue();
    User forwardedUser = userCaptor.getValue();

    assertEquals(17L, forwardedUser.getId());
    assertEquals("Москва", forwardedUser.getCity());
    assertEquals(55.7558, forwardedUser.getCityLat());
    assertEquals("Tomato", forwarded.plantName());
    assertEquals(WateringProfileType.OUTDOOR_GARDEN, forwarded.wateringProfileType());
    assertEquals(RecommendationMode.AI, forwarded.mode());
    assertEquals(GrowthStage.FLOWERING, forwarded.growthStageV2());
    assertEquals(SoilType.LOAMY, forwarded.soilTypeV2());
    assertEquals(SunlightExposure.HIGH, forwarded.sunlightExposure());
    assertEquals("room-1", forwarded.haRoomId());
    assertEquals("sensor.soil", forwarded.soilMoistureSensorEntityId());
    assertEquals("Москва", forwarded.city());
    assertEquals(RecommendationSource.AI, response.source());
    assertNotNull(response.weatherContextPreview());
    assertEquals("OPEN_METEO", response.weatherContextPreview().providerSource());
  }

  @Test
  void facadePreviewReturnsUnifiedResultWithWeatherAndSensorContext() {
    when(engine.recommendPreview(any(), any())).thenReturn(previewResponse());

    RecommendationResult result = facade.preview(previewMapper.map(user(), previewRequest()));

    assertEquals(RecommendationExecutionMode.AI, result.mode());
    assertEquals(RecommendationSource.AI.name(), result.source());
    assertEquals(4, result.recommendedIntervalDays());
    assertNotNull(result.weatherContext());
    assertEquals("OPEN_METEO", result.weatherContext().providerUsed());
    assertEquals("Moscow", result.weatherContext().locationDisplayName());
    assertTrue(result.sensorContext() instanceof WateringSensorContextDto);
    assertEquals("AI summary", result.explainability().summary());
  }

  @Test
  void responseAdapterMapsUnifiedResultBackToLegacyPreviewDto() {
    RecommendationResult result = new RecommendationResult(
        5,
        450,
        RecommendationSource.HYBRID.name(),
        RecommendationExecutionMode.HYBRID,
        0.81,
        new com.example.plantbot.service.recommendation.model.RecommendationExplainability(
            RecommendationSource.HYBRID.name(),
            RecommendationExecutionMode.HYBRID,
            "Hybrid summary",
            List.of("reason-1"),
            List.of("warning-1"),
            List.of(new RecommendationFactor("WEATHER", "Weather", "rain", 0.8, true)),
            "Weather contribution",
            "Sensor contribution",
            "AI contribution",
            null,
            null
        ),
        new WeatherContext(
            true,
            false,
            false,
            false,
            "OPEN_METEO",
            "Moscow",
            22.0,
            60.0,
            2.0,
            5.0,
            28.0,
            3.0,
            "HIGH",
            List.of("Weather warning")
        ),
        previewResponse().sensorContext(),
        Instant.now(),
        false
    );

    WateringRecommendationResponse response = responseAdapter.adapt(
        result,
        previewMapper.map(user(), previewRequest())
    );

    assertEquals(RecommendationSource.HYBRID, response.source());
    assertEquals(5, response.recommendedIntervalDays());
    assertEquals(450, response.recommendedWaterMl());
    assertEquals("Hybrid summary", response.summary());
    assertEquals(List.of("reason-1"), response.reasoning());
    assertEquals(List.of("warning-1"), response.warnings());
    assertNotNull(response.weatherContextPreview());
    assertEquals("OPEN_METEO", response.weatherContextPreview().providerSource());
    assertNotNull(response.sensorContext());
  }

  private User user() {
    User user = new User();
    user.setId(17L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);
    return user;
  }

  private WateringRecommendationPreviewRequest previewRequest() {
    return new WateringRecommendationPreviewRequest(
        "Tomato",
        WateringProfileType.OUTDOOR_GARDEN,
        PlantPlacementType.OUTDOOR,
        500,
        true,
        true,
        null,
        PlantEnvironmentType.OUTDOOR_GARDEN,
        null,
        3,
        null,
        null,
        null,
        null,
        "tomato",
        "FLOWERING",
        GrowthStage.FLOWERING,
        true,
        true,
        true,
        4.0,
        SoilType.LOAMY,
        SunlightExposure.HIGH,
        "room-1",
        "Greenhouse",
        "sensor.temp",
        "sensor.humidity",
        "sensor.soil",
        "sensor.lux",
        null,
        RecommendationMode.AI
    );
  }

  private WateringRecommendationResponse previewResponse() {
    return new WateringRecommendationResponse(
        RecommendationSource.AI,
        PlantEnvironmentType.OUTDOOR_GARDEN,
        420,
        4,
        420,
        WateringMode.STANDARD,
        0.88,
        "AI summary",
        List.of("AI reason"),
        List.of("AI warning"),
        true,
        new WeatherContextPreviewResponse(
            true,
            false,
            false,
            false,
            "OPEN_METEO",
            "Moscow",
            "Moscow region",
            21.0,
            58.0,
            1.0,
            4.5,
            26.0,
            3.2,
            "HIGH",
            List.of("Weather warning")
        ),
        null,
        new WateringSensorContextDto(
            true,
            "room-1",
            "Greenhouse",
            24.0,
            48.0,
            31.0,
            900.0,
            SensorConfidence.HIGH,
            "HOME_ASSISTANT",
            List.of("sensor.temp", "sensor.soil"),
            "ok"
        )
    );
  }
}
