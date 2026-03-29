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
import com.example.plantbot.service.RecommendationSnapshotService;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEventType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecommendationHistoryProjectionServiceTest {

  @Test
  void projectionBuildsVisibleEntriesFromSnapshots() {
    RecommendationSnapshotService snapshotService = mock(RecommendationSnapshotService.class);
    RecommendationHistoryDiffEngine diffEngine = new RecommendationHistoryDiffEngine(new ObjectMapper());
    RecommendationHistoryProjectionService service = new RecommendationHistoryProjectionService(snapshotService, diffEngine);

    Plant plant = indoorPlant(42L);
    RecommendationSnapshot latest = snapshot(3L, plant, RecommendationSource.WEATHER_ADJUSTED, 5, 400,
        "Полив стал чаще из-за жары", "[\"Стало суше и теплее.\"]", "[\"Рекомендация осторожная: ветер недоступен.\"]", "{\"available\":true}");
    RecommendationSnapshot middle = snapshot(2L, plant, RecommendationSource.MANUAL, 7, 300,
        "Режим обновлён вручную", "[\"Пользовательский manual override.\"]", null, null);
    RecommendationSnapshot first = snapshot(1L, plant, RecommendationSource.MANUAL, 7, 250,
        "Initial baseline", null, null, null);

    when(snapshotService.listForPlant(plant, 6)).thenReturn(List.of(latest, middle, first));

    List<RecommendationHistoryEntry> entries = service.buildHistoryForPlant(plant, 5);

    assertEquals(3, entries.size());
    assertEquals(RecommendationHistoryEventType.WEATHER_DRIVEN_CHANGE, entries.get(0).eventType());
    assertEquals(RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED, entries.get(1).eventType());
    assertEquals(RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED, entries.get(2).eventType());
    assertTrue(entries.get(0).meaningfulChange());
  }

  @Test
  void projectionSuppressesTinyNoiseEntries() {
    RecommendationSnapshotService snapshotService = mock(RecommendationSnapshotService.class);
    RecommendationHistoryDiffEngine diffEngine = new RecommendationHistoryDiffEngine(new ObjectMapper());
    RecommendationHistoryProjectionService service = new RecommendationHistoryProjectionService(snapshotService, diffEngine);

    Plant plant = indoorPlant(43L);
    RecommendationSnapshot latest = snapshot(2L, plant, RecommendationSource.MANUAL, 7, 320,
        "Почти без изменений", null, null, null);
    RecommendationSnapshot first = snapshot(1L, plant, RecommendationSource.MANUAL, 7, 300,
        "Initial baseline", null, null, null);

    when(snapshotService.listForPlant(plant, 6)).thenReturn(List.of(latest, first));

    List<RecommendationHistoryEntry> entries = service.buildHistoryForPlant(plant, 5);

    assertEquals(1, entries.size());
    assertEquals(RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED, entries.get(0).eventType());
  }

  @Test
  void projectionDerivesSeedStageChangeFromSeedSnapshots() {
    RecommendationSnapshotService snapshotService = mock(RecommendationSnapshotService.class);
    RecommendationHistoryDiffEngine diffEngine = new RecommendationHistoryDiffEngine(new ObjectMapper());
    RecommendationHistoryProjectionService service = new RecommendationHistoryProjectionService(snapshotService, diffEngine);

    Plant plant = seedPlant(44L);
    RecommendationSnapshot latest = snapshot(2L, plant, RecommendationSource.FALLBACK, 1, 50,
        "Сеянец уже стабилен", "[\"Стадия: SEEDLING\"]", null, null);
    RecommendationSnapshot first = snapshot(1L, plant, RecommendationSource.FALLBACK, 1, 50,
        "Период прорастания", "[\"Стадия: GERMINATING\"]", null, null);

    when(snapshotService.listForPlant(plant, 6)).thenReturn(List.of(latest, first));

    List<RecommendationHistoryEntry> entries = service.buildHistoryForPlant(plant, 5);

    assertEquals(2, entries.size());
    assertEquals(RecommendationHistoryEventType.SEED_STAGE_CHANGE, entries.get(0).eventType());
    assertEquals(SeedStage.SEEDLING, entries.get(0).seedStage());
    assertEquals(SeedStage.GERMINATING, entries.get(0).previousSeedStage());
  }

  @Test
  void projectionRecognizesSeedMigrationSummary() {
    RecommendationSnapshotService snapshotService = mock(RecommendationSnapshotService.class);
    RecommendationHistoryDiffEngine diffEngine = new RecommendationHistoryDiffEngine(new ObjectMapper());
    RecommendationHistoryProjectionService service = new RecommendationHistoryProjectionService(snapshotService, diffEngine);

    Plant plant = indoorPlant(45L);
    RecommendationSnapshot latest = snapshot(2L, plant, RecommendationSource.MANUAL, 5, 300,
        "Migration from seed mode.", null, null, null);
    RecommendationSnapshot first = snapshot(1L, plant, RecommendationSource.FALLBACK, 1, 50,
        "Initial baseline", null, null, null);

    when(snapshotService.listForPlant(plant, 6)).thenReturn(List.of(latest, first));

    List<RecommendationHistoryEntry> entries = service.buildHistoryForPlant(plant, 5);

    assertEquals(2, entries.size());
    assertEquals(RecommendationHistoryEventType.MIGRATED_FROM_SEED, entries.get(0).eventType());
  }

  @Test
  void projectionSuppressesNoChangeRefreshWithOnlyWindWarning() {
    RecommendationSnapshotService snapshotService = mock(RecommendationSnapshotService.class);
    RecommendationHistoryDiffEngine diffEngine = new RecommendationHistoryDiffEngine(new ObjectMapper());
    RecommendationHistoryProjectionService service = new RecommendationHistoryProjectionService(snapshotService, diffEngine);

    Plant plant = indoorPlant(46L);
    RecommendationSnapshot latest = snapshot(3L, plant, RecommendationSource.MANUAL, 8, 250,
        "Рекомендация рассчитана с учётом ручной настройки полива.",
        "[\"Базовый интервал: 7 дн.\",\"Учтён текущий погодный контекст.\"]",
        "[\"Скорость ветра недоступна в унифицированном API, расчёт без wind-фактора.\"]",
        "{\"available\":true}");
    RecommendationSnapshot middle = snapshot(2L, plant, RecommendationSource.MANUAL, 8, 250,
        "Режим обновлён вручную", "[\"Пользовательский manual override.\"]", null, null);
    RecommendationSnapshot first = snapshot(1L, plant, RecommendationSource.MANUAL, 7, 250,
        "Initial baseline", null, null, null);

    when(snapshotService.listForPlant(plant, 6)).thenReturn(List.of(latest, middle, first));

    List<RecommendationHistoryEntry> entries = service.buildHistoryForPlant(plant, 5);

    assertEquals(2, entries.size());
    assertEquals(RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED, entries.get(0).eventType());
    assertEquals(RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED, entries.get(1).eventType());
  }

  private Plant indoorPlant(Long id) {
    Plant plant = new Plant();
    plant.setId(id);
    plant.setName("Plant");
    plant.setType(PlantType.DEFAULT);
    plant.setPlacement(PlantPlacement.INDOOR);
    plant.setCategory(PlantCategory.HOME);
    plant.setWateringProfile(PlantEnvironmentType.INDOOR);
    plant.setGrowthStage(PlantGrowthStage.VEGETATIVE);
    return plant;
  }

  private Plant seedPlant(Long id) {
    Plant plant = indoorPlant(id);
    plant.setCategory(PlantCategory.SEED_START);
    plant.setWateringProfile(PlantEnvironmentType.SEED_START);
    plant.setSeedStage(SeedStage.SEEDLING);
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
    snapshot.setCreatedAt(Instant.parse("2026-03-28T10:15:30Z").plusSeconds(id));
    snapshot.setGeneratedAt(Instant.parse("2026-03-28T10:15:00Z").plusSeconds(id));
    return snapshot;
  }
}
