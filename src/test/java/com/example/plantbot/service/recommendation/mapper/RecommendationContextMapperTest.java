package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantPlacementType;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedContainerType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedSubstrateType;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.service.OutdoorWeatherContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.util.LearningInfo;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationContextMapperTest {

  private final RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
  private final OutdoorWeatherContextService outdoorWeatherContextService = mock(OutdoorWeatherContextService.class);
  private final WeatherContextAdapter weatherContextAdapter = new WeatherContextAdapter();
  private final LocationContextResolver locationResolver = new LocationContextResolver();
  private final WeatherContextResolver weatherResolver = new WeatherContextResolver(outdoorWeatherContextService, weatherContextAdapter);
  private final PreviewRecommendationContextMapper previewMapper = new PreviewRecommendationContextMapper(support, locationResolver, weatherResolver);
  private final PlantRecommendationContextMapper plantMapper = new PlantRecommendationContextMapper(support, locationResolver, weatherResolver);
  private final SeedRecommendationContextMapper seedMapper = new SeedRecommendationContextMapper(support, locationResolver, weatherResolver);

  @Test
  void previewMapperMapsOutdoorFieldsIntoUnifiedContext() {
    stubNormalizedWeather();
    User user = new User();
    user.setId(42L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);

    WateringRecommendationPreviewRequest request = new WateringRecommendationPreviewRequest(
        "Petunia",
        WateringProfileType.OUTDOOR_ORNAMENTAL,
        PlantPlacementType.OUTDOOR,
        320,
        true,
        true,
        "Moscow region",
        PlantEnvironmentType.OUTDOOR_ORNAMENTAL,
        null,
        4,
        PlantContainerType.CONTAINER,
        12.0,
        "FULL_SUN",
        "LOAMY",
        null,
        null,
        null,
        false,
        true,
        true,
        2.5,
        SoilType.LOAMY,
        SunlightExposure.HIGH,
        "ha-room-1",
        "Terrace",
        "sensor.temp",
        "sensor.humidity",
        "sensor.soil",
        "sensor.lux",
        "Moscow",
        RecommendationMode.HYBRID
    );

    RecommendationRequestContext context = previewMapper.map(user, request);

    assertEquals(RecommendationFlowType.PREVIEW, context.flowType());
    assertEquals("Petunia", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_DECORATIVE, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_ORNAMENTAL, context.environmentType());
    assertEquals(PlantPlacement.OUTDOOR, context.placement());
    assertEquals("OUTDOOR_ORNAMENTAL", context.wateringProfileType());
    assertEquals(4, context.baseIntervalDays());
    assertEquals(320, context.manualWaterVolumeMl());
    assertEquals(PlantContainerType.CONTAINER, context.containerType());
    assertEquals(12.0, context.containerVolumeLiters());
    assertEquals(2.5, context.outdoorAreaM2());
    assertEquals(OutdoorSoilType.LOAMY, context.outdoorSoilType());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertFalse(Boolean.TRUE.equals(context.greenhouse()));
    assertTrue(Boolean.TRUE.equals(context.mulched()));
    assertTrue(Boolean.TRUE.equals(context.dripIrrigation()));
    assertInstanceOf(PreviewSensorSelectionContext.class, context.sensorContext());
    PreviewSensorSelectionContext sensorSelection = (PreviewSensorSelectionContext) context.sensorContext();
    assertEquals("ha-room-1", sensorSelection.haRoomId());
    assertEquals("sensor.soil", sensorSelection.soilMoistureSensorEntityId());
    assertEquals("Moscow", context.locationContext().displayName());
    assertEquals(LocationSource.REQUEST_EXPLICIT, context.locationContext().locationSource());
    assertNotNull(context.weatherContext());
    assertTrue(context.weatherContext().available());
    assertEquals("OPEN_METEO", context.weatherContext().providerUsed());
    assertEquals(RecommendationExecutionMode.HYBRID, context.mode());
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    assertFalse(context.allowPersistence());
  }

  @Test
  void plantMapperMapsExistingPlantAndManualOverrideState() {
    stubNormalizedWeather();
    User user = new User();
    user.setId(7L);
    user.setCity("Kazan");
    user.setCityDisplayName("Казань");

    Plant plant = new Plant();
    plant.setId(11L);
    plant.setUser(user);
    plant.setName("Tomato");
    plant.setCategory(PlantCategory.OUTDOOR_GARDEN);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_GARDEN);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setWateringProfileType(WateringProfileType.OUTDOOR_GARDEN);
    plant.setBaseIntervalDays(3);
    plant.setPreferredWaterMl(480);
    plant.setRecommendedIntervalDays(2);
    plant.setRecommendedWaterVolumeMl(620);
    plant.setManualWaterVolumeMl(550);
    plant.setManualOverrideActive(true);
    plant.setRecommendationSource(RecommendationSource.HYBRID);
    plant.setGeneratedAt(Instant.parse("2026-03-22T12:00:00Z"));
    plant.setPotVolumeLiters(6.0);
    plant.setContainerType(PlantContainerType.OPEN_GROUND);
    plant.setContainerVolumeLiters(0.0);
    plant.setOutdoorAreaM2(4.0);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setGreenhouse(true);
    plant.setMulched(true);
    plant.setDripIrrigation(true);
    plant.setGrowthStage(PlantGrowthStage.FRUITING);
    plant.setCropType("tomato");
    plant.setCity("Kazan");
    plant.setRegion("Tatarstan");

    RecommendationRequestContext context = plantMapper.map(
        plant,
        user,
        RecommendationFlowType.RUNTIME,
        RecommendationExecutionMode.HYBRID
    );

    assertEquals(7L, context.userId());
    assertEquals(11L, context.plantId());
    assertEquals(RecommendationFlowType.RUNTIME, context.flowType());
    assertEquals("Tomato", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_GARDEN, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, context.environmentType());
    assertEquals(PlantPlacement.OUTDOOR, context.placement());
    assertEquals(RecommendationExecutionMode.HYBRID, context.mode());
    assertEquals(550, context.manualWaterVolumeMl());
    assertTrue(context.manualOverrideActive());
    assertEquals(4.0, context.outdoorAreaM2());
    assertEquals(OutdoorSoilType.LOAMY, context.outdoorSoilType());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertTrue(Boolean.TRUE.equals(context.greenhouse()));
    assertTrue(Boolean.TRUE.equals(context.mulched()));
    assertTrue(Boolean.TRUE.equals(context.dripIrrigation()));
    assertEquals(PlantGrowthStage.FRUITING, context.growthStage());
    assertEquals("tomato", context.cropType());
    assertEquals(LocationSource.PLANT_EXPLICIT, context.locationContext().locationSource());
    assertEquals("Kazan", context.locationContext().displayName());
    assertNotNull(context.weatherContext());
    assertTrue(context.weatherContext().available());
    assertEquals("OPEN_METEO", context.weatherContext().providerUsed());
  }

  @Test
  void plantRefreshMapperMapsPersistedPlantContextAndSensorContext() {
    stubNormalizedWeather();
    User user = new User();
    user.setId(8L);
    user.setCity("Saint Petersburg");
    user.setCityDisplayName("Санкт-Петербург");
    user.setCityLat(59.93);
    user.setCityLon(30.31);

    Plant plant = new Plant();
    plant.setId(44L);
    plant.setUser(user);
    plant.setName("Rose");
    plant.setCategory(PlantCategory.OUTDOOR_DECORATIVE);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_ORNAMENTAL);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setWateringProfileType(WateringProfileType.OUTDOOR_ORNAMENTAL);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(350);
    plant.setRecommendedIntervalDays(3);
    plant.setRecommendedWaterVolumeMl(420);
    plant.setManualWaterVolumeMl(390);
    plant.setManualOverrideActive(true);
    plant.setRecommendationSource(RecommendationSource.MANUAL);
    plant.setGeneratedAt(Instant.parse("2026-03-28T12:00:00Z"));
    plant.setContainerType(PlantContainerType.OPEN_GROUND);
    plant.setContainerVolumeLiters(18.0);
    plant.setOutdoorAreaM2(2.0);
    plant.setSunlightExposure(SunlightExposure.HIGH);
    plant.setGrowthStageV2(com.example.plantbot.domain.GrowthStage.FLOWERING);
    plant.setGreenhouse(false);
    plant.setMulched(true);
    plant.setDripIrrigation(false);
    plant.setCity(null);
    plant.setRegion("Leningrad oblast");
    plant.setWeatherAdjustmentEnabled(false);
    plant.setAiWateringEnabled(false);

    WateringSensorContextDto sensorContext = new WateringSensorContextDto(
        true, "room-1", "Garden", 23.0, 55.0, 48.0, 500.0, SensorConfidence.HIGH, "HOME_ASSISTANT", List.of("sensor.soil"), "ok"
    );

    RecommendationRequestContext context = plantMapper.mapForRefresh(plant, user, sensorContext);

    assertEquals(RecommendationFlowType.RUNTIME, context.flowType());
    assertEquals(RecommendationExecutionMode.HYBRID, context.mode());
    assertEquals("Rose", context.plantName());
    assertEquals(PlantCategory.OUTDOOR_DECORATIVE, context.category());
    assertEquals(PlantEnvironmentType.OUTDOOR_ORNAMENTAL, context.environmentType());
    assertEquals(PlantPlacement.OUTDOOR, context.placement());
    assertEquals("OUTDOOR_ORNAMENTAL", context.wateringProfileType());
    assertEquals(4, context.baseIntervalDays());
    assertEquals(350, context.preferredWaterMl());
    assertEquals(3, context.recommendedIntervalDays());
    assertEquals(420, context.recommendedWaterVolumeMl());
    assertEquals(390, context.manualWaterVolumeMl());
    assertTrue(context.manualOverrideActive());
    assertEquals(PlantContainerType.OPEN_GROUND, context.containerType());
    assertEquals(18.0, context.containerVolumeLiters());
    assertEquals(2.0, context.outdoorAreaM2());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertEquals(PlantGrowthStage.FLOWERING, context.growthStage());
    assertEquals(LocationSource.PLANT_EXPLICIT, context.locationContext().locationSource());
    assertEquals("Leningrad oblast", context.locationContext().displayName());
    assertNull(context.weatherContext());
    assertSame(sensorContext, context.sensorContext());
    assertFalse(context.allowAI());
    assertFalse(context.allowWeather());
    assertTrue(context.allowSensors());
  }

  @Test
  void plantQuickMapperBuildsLightweightQuickContextWithoutWeatherPayload() {
    User user = new User();
    user.setId(9L);
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");

    Plant plant = new Plant();
    plant.setId(55L);
    plant.setName("Quick Basil");
    plant.setCategory(PlantCategory.OUTDOOR_GARDEN);
    plant.setWateringProfile(PlantEnvironmentType.OUTDOOR_GARDEN);
    plant.setPlacement(PlantPlacement.OUTDOOR);
    plant.setType(PlantType.DEFAULT);
    plant.setBaseIntervalDays(4);
    plant.setPreferredWaterMl(450);
    plant.setRecommendedIntervalDays(3);
    plant.setRecommendedWaterVolumeMl(400);
    plant.setManualWaterVolumeMl(380);
    plant.setManualOverrideActive(true);
    plant.setOutdoorAreaM2(2.5);
    plant.setOutdoorSoilType(OutdoorSoilType.LOAMY);
    plant.setSunExposure(SunExposure.FULL_SUN);
    plant.setMulched(true);
    plant.setCity("Moscow");
    plant.setRegion("Moscow region");

    LearningInfo learning = new LearningInfo(4.0, 3.5, 3.8, 1.0, 1.0, 0.9, 3.42);

    RecommendationRequestContext context = plantMapper.mapForQuick(plant, user, learning, true);

    assertEquals(RecommendationFlowType.RUNTIME, context.flowType());
    assertEquals(RecommendationExecutionMode.HEURISTIC, context.mode());
    assertEquals("Quick Basil", context.plantName());
    assertEquals(4, context.baseIntervalDays());
    assertEquals(450, context.preferredWaterMl());
    assertEquals(3, context.recommendedIntervalDays());
    assertEquals(400, context.recommendedWaterVolumeMl());
    assertTrue(context.manualOverrideActive());
    assertEquals(2.5, context.outdoorAreaM2());
    assertEquals(OutdoorSoilType.LOAMY, context.outdoorSoilType());
    assertEquals(SunExposure.FULL_SUN, context.sunExposure());
    assertNotNull(context.locationContext());
    assertNull(context.weatherContext());
    assertNull(context.sensorContext());
    assertSame(learning, context.learningContext());
    assertNotNull(context.seasonContext());
    assertFalse(context.allowAI());
    assertFalse(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    assertFalse(context.allowPersistence());
  }

  @Test
  void seedMapperMapsSeedSpecificFieldsIntoSeedContext() {
    stubNormalizedWeather();
    User user = new User();
    user.setId(100L);
    user.setCity("Saint Petersburg");

    SeedRecommendationPreviewRequest request = new SeedRecommendationPreviewRequest(
        "Pepper",
        SeedStage.GERMINATING,
        PlantEnvironmentType.OUTDOOR_GARDEN,
        SeedContainerType.SEED_TRAY,
        SeedSubstrateType.SEED_START_MIX,
        LocalDate.of(2026, 3, 10),
        24.5,
        true,
        false,
        "Leningrad oblast"
    );

    RecommendationRequestContext context = seedMapper.map(user, request);

    assertEquals(RecommendationFlowType.PREVIEW, context.flowType());
    assertEquals(PlantCategory.SEED_START, context.category());
    assertEquals(PlantEnvironmentType.SEED_START, context.environmentType());
    assertEquals(SeedStage.GERMINATING, context.seedStage());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, context.targetEnvironmentType());
    assertEquals(SeedContainerType.SEED_TRAY, context.seedContainerType());
    assertEquals(SeedSubstrateType.SEED_START_MIX, context.seedSubstrateType());
    assertEquals(LocalDate.of(2026, 3, 10), context.sowingDate());
    assertEquals(24.5, context.germinationTemperatureC());
    assertTrue(Boolean.TRUE.equals(context.underCover()));
    assertFalse(Boolean.TRUE.equals(context.growLight()));
    assertEquals(LocationSource.REQUEST_EXPLICIT, context.locationContext().locationSource());
    assertEquals("Leningrad oblast", context.locationContext().displayName());
    assertNull(context.weatherContext());
    assertEquals(RecommendationExecutionMode.AI, context.mode());
    assertTrue(context.allowAI());
    assertFalse(context.allowWeather());
    assertFalse(context.allowSensors());
    assertFalse(context.allowLearning());
    assertFalse(context.allowPersistence());
    assertNotNull(context.seasonContext());
  }

  @Test
  void requestLocationFallsBackToUserDefaultWhenExplicitLocationMissing() {
    User user = new User();
    user.setCity("Moscow");
    user.setCityDisplayName("Москва");
    user.setCityLat(55.7558);
    user.setCityLon(37.6173);

    var context = support.buildRequestLocationContext(user, null, null);

    assertEquals(LocationSource.USER_DEFAULT, context.locationSource());
    assertEquals("Москва", context.displayName());
    assertEquals("Москва", context.canonicalQuery());
    assertEquals(55.7558, context.lat());
    assertEquals(37.6173, context.lon());
  }

  @Test
  void requestLocationUsesNoneWhenNoRequestAndNoUserLocation() {
    var context = support.buildRequestLocationContext(null, null, null);

    assertEquals(LocationSource.NONE, context.locationSource());
    assertNull(context.displayName());
    assertNull(context.canonicalQuery());
    assertNull(context.cityLabel());
    assertNull(context.regionLabel());
    assertNull(context.lat());
    assertNull(context.lon());
  }

  @Test
  void weatherResolverReturnsUnavailableContextWhenLocationMissing() {
    var context = weatherResolver.resolve(null, null, RecommendationFlowType.PREVIEW);

    assertFalse(context.available());
    assertTrue(context.degraded());
    assertEquals(List.of("Локация не задана, погодный контекст недоступен."), context.warnings());
  }

  @Test
  void weatherResolverMapsNormalizedWeatherIntoUnifiedWeatherContext() {
    stubNormalizedWeather();
    User user = new User();
    user.setCity("Moscow");

    var location = locationResolver.resolveUserDefault(user);
    var context = weatherResolver.resolve(user, location, RecommendationFlowType.RUNTIME);

    assertTrue(context.available());
    assertFalse(context.degraded());
    assertFalse(context.fallbackUsed());
    assertEquals("OPEN_METEO", context.providerUsed());
    assertEquals("Moscow", context.locationDisplayName());
    assertEquals(24.5, context.temperatureNowC());
    assertEquals(61.0, context.humidityNowPercent());
    assertEquals(2.0, context.precipitationLast24hMm());
    assertEquals(7.5, context.precipitationForecastNext72hMm());
    assertEquals(29.0, context.maxTemperatureNext3DaysC());
    assertEquals(3.4, context.windNowMs());
    assertEquals("HIGH", context.confidence());
    assertEquals(List.of("Weather warning"), context.warnings());
  }

  private void stubNormalizedWeather() {
    when(outdoorWeatherContextService.resolve(any(), nullable(String.class), nullable(String.class))).thenReturn(
        new NormalizedWeatherContext(
            true,
            false,
            false,
            false,
            WeatherProvider.OPEN_METEO,
            "Moscow",
            "Moscow region",
            24.5,
            61.0,
            2.0,
            7.5,
            29.0,
            3.4,
            WeatherConfidence.HIGH,
            List.of("Weather warning")
        )
    );
  }
}
