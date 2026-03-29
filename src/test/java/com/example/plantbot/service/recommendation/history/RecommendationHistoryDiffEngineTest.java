package com.example.plantbot.service.recommendation.history;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryChangeSignificance;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEventType;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistorySource;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecommendationHistoryDiffEngineTest {

  private final RecommendationHistoryDiffEngine engine = new RecommendationHistoryDiffEngine(new ObjectMapper());

  @Test
  void refreshChangeMarksWeatherDrivenDifferenceAsMeaningful() {
    Plant plant = plant(11L);
    RecommendationSnapshot previous = snapshot(1L, plant, RecommendationSource.MANUAL, 7, 300, "Baseline", "[\"Базовый интервал: 7 дн.\"]", null, null);
    RecommendationSnapshot current = snapshot(
        2L,
        plant,
        RecommendationSource.WEATHER_ADJUSTED,
        5,
        450,
        "Полив стал чаще из-за жары",
        "[\"Стало суше и теплее.\",\"Осадков почти не ожидается.\"]",
        "[\"Рекомендация осторожная: ветер недоступен.\"]",
        "{\"available\":true}"
    );

    RecommendationHistoryEntry entry = engine.buildEntry(
        RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest.fromPlant(
            plant,
            current,
            previous,
            RecommendationHistoryEventType.WEATHER_DRIVEN_CHANGE,
            RecommendationHistorySource.REFRESH_FLOW
        )
    );

    assertTrue(entry.meaningfulChange());
    assertEquals(RecommendationHistoryChangeSignificance.MAJOR, entry.changeSignificance());
    assertEquals(-2, entry.deltaIntervalDays());
    assertEquals(150, entry.deltaWaterMl());
    assertNotNull(entry.weatherContribution());
    assertFalse(entry.factors().isEmpty());
  }

  @Test
  void tinyRefreshChangeIsSuppressedAsNoise() {
    Plant plant = plant(12L);
    RecommendationSnapshot previous = snapshot(1L, plant, RecommendationSource.MANUAL, 7, 300, "Baseline", null, null, null);
    RecommendationSnapshot current = snapshot(2L, plant, RecommendationSource.MANUAL, 7, 320, "Почти без изменений", null, null, null);

    RecommendationHistoryEntry entry = engine.buildEntry(
        RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest.fromPlant(
            plant,
            current,
            previous,
            RecommendationHistoryEventType.REFRESH_RECOMMENDATION_CHANGED,
            RecommendationHistorySource.REFRESH_FLOW
        )
    );

    assertFalse(entry.meaningfulChange());
    assertEquals(RecommendationHistoryChangeSignificance.MINOR, entry.changeSignificance());
  }

  @Test
  void manualOverrideEventAlwaysVisible() {
    Plant plant = plant(13L);
    plant.setManualOverrideActive(true);
    RecommendationSnapshot current = snapshot(2L, plant, RecommendationSource.MANUAL, 5, 350, "Режим зафиксирован вручную", null, null, null);

    RecommendationHistoryEntry entry = engine.buildEntry(
        RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest.fromPlant(
            plant,
            current,
            null,
            RecommendationHistoryEventType.MANUAL_OVERRIDE_APPLIED,
            RecommendationHistorySource.APPLY_FLOW
        )
    );

    assertTrue(entry.meaningfulChange());
    assertEquals(RecommendationHistoryChangeSignificance.MAJOR, entry.changeSignificance());
    assertEquals(RecommendationSource.MANUAL, entry.currentSource());
  }

  @Test
  void seedStageChangeRemainsMeaningfulWithoutMlFocus() {
    Plant plant = plant(14L);
    plant.setCategory(PlantCategory.SEED_START);
    plant.setWateringProfile(PlantEnvironmentType.SEED_START);
    plant.setSeedStage(SeedStage.SEEDLING);
    RecommendationSnapshot current = snapshot(4L, plant, RecommendationSource.FALLBACK, 1, 50, "Сеянец уже стабилен", "[\"Стадия: SEEDLING\"]", null, null);

    RecommendationHistoryEntry entry = engine.buildEntry(
        new RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest(
            plant.getId(),
            current,
            null,
            RecommendationHistoryEventType.SEED_STAGE_CHANGE,
            RecommendationHistorySource.SEED_FLOW,
            false,
            false,
            null,
            null,
            SeedStage.SEEDLING,
            SeedStage.GERMINATING
        )
    );

    assertTrue(entry.meaningfulChange());
    assertEquals(RecommendationHistoryChangeSignificance.MODERATE, entry.changeSignificance());
    assertEquals(SeedStage.SEEDLING, entry.seedStage());
    assertEquals(SeedStage.GERMINATING, entry.previousSeedStage());
  }

  @Test
  void degradedWarningsCanMakeAutoChangeVisible() {
    Plant plant = plant(15L);
    RecommendationSnapshot previous = snapshot(1L, plant, RecommendationSource.WEATHER_ADJUSTED, 7, 300, "Baseline", null, null, null);
    RecommendationSnapshot current = snapshot(
        2L,
        plant,
        RecommendationSource.FALLBACK,
        7,
        300,
        "Режим пересчитан осторожно",
        null,
        "[\"Погодный контекст работает в degraded mode.\"]",
        "{\"available\":false}"
    );

    RecommendationHistoryEntry entry = engine.buildEntry(
        RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest.fromPlant(
            plant,
            current,
            previous,
            RecommendationHistoryEventType.SCHEDULED_RECALCULATION_CHANGED,
            RecommendationHistorySource.SCHEDULED_FLOW
        )
    );

    assertTrue(entry.meaningfulChange());
    assertTrue(entry.userActionRequired());
    assertEquals(RecommendationHistoryChangeSignificance.MODERATE, entry.changeSignificance());
  }

  @Test
  void genericWindUnavailableWarningDoesNotMakeNoChangeVisible() {
    Plant plant = plant(16L);
    RecommendationSnapshot previous = snapshot(1L, plant, RecommendationSource.MANUAL, 8, 250, "Baseline", null, null, "{\"available\":true}");
    RecommendationSnapshot current = snapshot(
        2L,
        plant,
        RecommendationSource.MANUAL,
        8,
        250,
        "Рекомендация рассчитана с учётом ручной настройки полива.",
        "[\"Учтён текущий погодный контекст.\"]",
        "[\"Скорость ветра недоступна в унифицированном API, расчёт без wind-фактора.\"]",
        "{\"available\":true}"
    );

    RecommendationHistoryEntry entry = engine.buildEntry(
        RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest.fromPlant(
            plant,
            current,
            previous,
            RecommendationHistoryEventType.REFRESH_RECOMMENDATION_CHANGED,
            RecommendationHistorySource.REFRESH_FLOW
        )
    );

    assertFalse(entry.meaningfulChange());
    assertFalse(entry.userActionRequired());
    assertEquals(RecommendationHistoryChangeSignificance.MINOR, entry.changeSignificance());
  }

  private Plant plant(Long id) {
    Plant plant = new Plant();
    plant.setId(id);
    plant.setName("Test plant");
    plant.setType(PlantType.DEFAULT);
    plant.setPlacement(PlantPlacement.INDOOR);
    plant.setCategory(PlantCategory.HOME);
    plant.setWateringProfile(PlantEnvironmentType.INDOOR);
    plant.setGrowthStage(PlantGrowthStage.VEGETATIVE);
    return plant;
  }

  private RecommendationSnapshot snapshot(Long id,
                                          Plant plant,
                                          RecommendationSource source,
                                          int intervalDays,
                                          int waterMl,
                                          String summary,
                                          String reasoningJson,
                                          String warningsJson,
                                          String weatherJson) {
    RecommendationSnapshot snapshot = new RecommendationSnapshot();
    snapshot.setId(id);
    snapshot.setPlant(plant);
    snapshot.setSource(source);
    snapshot.setRecommendedIntervalDays(intervalDays);
    snapshot.setRecommendedWaterVolumeMl(waterMl);
    snapshot.setSummary(summary);
    snapshot.setReasoningJson(reasoningJson);
    snapshot.setWarningsJson(warningsJson);
    snapshot.setWeatherContextSnapshotJson(weatherJson);
    snapshot.setCreatedAt(Instant.parse("2026-03-28T10:15:30Z"));
    snapshot.setGeneratedAt(Instant.parse("2026-03-28T10:15:00Z"));
    return snapshot;
  }
}
