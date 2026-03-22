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
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WateringProfileType;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class RecommendationContextMapperTest {

  private final RecommendationContextMapperSupport support = new RecommendationContextMapperSupport();
  private final PreviewRecommendationContextMapper previewMapper = new PreviewRecommendationContextMapper(support);
  private final PlantRecommendationContextMapper plantMapper = new PlantRecommendationContextMapper(support);
  private final SeedRecommendationContextMapper seedMapper = new SeedRecommendationContextMapper(support);

  @Test
  void previewMapperMapsOutdoorFieldsIntoUnifiedContext() {
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
        null,
        null,
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
    assertFalse(Boolean.TRUE.equals(context.greenhouse()));
    assertTrue(Boolean.TRUE.equals(context.mulched()));
    assertTrue(Boolean.TRUE.equals(context.dripIrrigation()));
    assertEquals("Moscow", context.locationContext().displayName());
    assertEquals(LocationSource.REQUEST_EXPLICIT, context.locationContext().locationSource());
    assertEquals(RecommendationExecutionMode.HYBRID, context.mode());
    assertTrue(context.allowAI());
    assertTrue(context.allowWeather());
    assertTrue(context.allowSensors());
    assertTrue(context.allowLearning());
    assertFalse(context.allowPersistence());
  }

  @Test
  void plantMapperMapsExistingPlantAndManualOverrideState() {
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
  }

  @Test
  void seedMapperMapsSeedSpecificFieldsIntoSeedContext() {
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
    assertFalse(context.allowWeather());
    assertFalse(context.allowSensors());
    assertFalse(context.allowLearning());
    assertFalse(context.allowPersistence());
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
}
