package com.example.plantbot.service;

import com.example.plantbot.controller.dto.CreatePlantRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedContainerType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedSubstrateType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class SeedLifecycleServiceTest {

  @Test
  void applySeedCreateFieldsDoesNotPolluteNormalPlantWithSeedDefaults() {
    SeedLifecycleService service = new SeedLifecycleService(
        mock(PlantService.class),
        mock(RecommendationSnapshotService.class),
        mock(AiTextCacheInvalidationService.class),
        new ObjectMapper()
    );
    Plant plant = new Plant();
    plant.setCategory(PlantCategory.HOME);
    plant.setWateringProfile(PlantEnvironmentType.INDOOR);

    CreatePlantRequest request = new CreatePlantRequest(
        "Monstera",               // name
        2.0,                       // potVolumeLiters
        7,                         // baseIntervalDays
        250,                       // preferredWaterMl
        RecommendationSource.MANUAL,
        "manual",                 // recommendationSummary
        null,                      // recommendationReasoningJson
        null,                      // recommendationWarningsJson
        null,                      // confidenceScore
        PlantType.DEFAULT,
        PlantPlacement.INDOOR,
        PlantCategory.HOME,
        PlantEnvironmentType.INDOOR,
        null,                      // wateringProfile
        "Moscow",
        "Moscow",
        null,                      // containerType
        null,                      // containerVolumeLiters
        null,                      // cropType
        null,                      // growthStage
        null,                      // seedStage
        null,                      // targetEnvironmentType
        null,                      // seedContainerType
        null,                      // seedSubstrateType
        null,                      // sowingDate
        null,                      // underCover
        null,                      // growLight
        null,                      // germinationTemperatureC
        null,                      // expectedGerminationDaysMin
        null,                      // expectedGerminationDaysMax
        null,                      // recommendedCheckIntervalHours
        null,                      // recommendedWateringMode
        null,                      // seedCareMode
        null,                      // seedSummary
        null,                      // seedReasoningJson
        null,                      // seedWarningsJson
        null,                      // seedCareSource
        null,                      // greenhouse
        null,                      // dripIrrigation
        null,                      // outdoorAreaM2
        null,                      // outdoorSoilType
        null,                      // sunExposure
        null,                      // mulched
        null,                      // perennial
        null                       // winterDormancyEnabled
    );

    service.applySeedCreateFields(plant, request);

    assertNull(plant.getSeedStage());
    assertNull(plant.getSowingDate());
    assertNull(plant.getSeedContainerType());
    assertNull(plant.getSeedActionHistoryJson());
  }

  @Test
  void applySeedCreateFieldsKeepsSeedDataForSeedPlants() {
    SeedLifecycleService service = new SeedLifecycleService(
        mock(PlantService.class),
        mock(RecommendationSnapshotService.class),
        mock(AiTextCacheInvalidationService.class),
        new ObjectMapper()
    );
    Plant plant = new Plant();
    plant.setCategory(PlantCategory.SEED_START);
    plant.setWateringProfile(PlantEnvironmentType.SEED_START);

    CreatePlantRequest request = new CreatePlantRequest(
        "Basil",                   // name
        0.3,                       // potVolumeLiters
        1,                         // baseIntervalDays
        30,                        // preferredWaterMl
        RecommendationSource.MANUAL,
        "seed",                   // recommendationSummary
        null,                      // recommendationReasoningJson
        null,                      // recommendationWarningsJson
        null,                      // confidenceScore
        PlantType.DEFAULT,
        PlantPlacement.INDOOR,
        PlantCategory.SEED_START,
        PlantEnvironmentType.SEED_START,
        null,                      // wateringProfile
        "Moscow",
        "Moscow",
        null,                      // containerType
        null,                      // containerVolumeLiters
        null,                      // cropType
        null,                      // growthStage
        SeedStage.GERMINATING,
        PlantEnvironmentType.INDOOR,
        SeedContainerType.SEED_TRAY,
        SeedSubstrateType.SEED_START_MIX,
        LocalDate.of(2026, 3, 20),
        true,                      // underCover
        true,                      // growLight
        22.0,                      // germinationTemperatureC
        2,                         // expectedGerminationDaysMin
        7,                         // expectedGerminationDaysMax
        12,                        // recommendedCheckIntervalHours
        null,                      // recommendedWateringMode
        "Seedling care",
        "seed summary",
        "[]",
        "[]",
        "FALLBACK",
        null,                      // greenhouse
        null,                      // dripIrrigation
        null,                      // outdoorAreaM2
        null,                      // outdoorSoilType
        null,                      // sunExposure
        null,                      // mulched
        null,                      // perennial
        null                       // winterDormancyEnabled
    );

    service.applySeedCreateFields(plant, request);

    assertEquals(SeedStage.GERMINATING, plant.getSeedStage());
    assertEquals(LocalDate.of(2026, 3, 20), plant.getSowingDate());
    assertEquals(SeedContainerType.SEED_TRAY, plant.getSeedContainerType());
    assertTrue(plant.getSeedActionHistoryJson().startsWith("["));
  }
}
