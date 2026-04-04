package com.example.plantbot.service.recommendation.history;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSnapshotFlow;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.service.RecommendationSnapshotService;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEventType;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistorySource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class RecommendationHistoryProjectionService {
  private final RecommendationSnapshotService recommendationSnapshotService;
  private final RecommendationHistoryDiffEngine diffEngine;

  public RecommendationHistoryProjectionService(
      RecommendationSnapshotService recommendationSnapshotService,
      RecommendationHistoryDiffEngine diffEngine
  ) {
    this.recommendationSnapshotService = recommendationSnapshotService;
    this.diffEngine = diffEngine;
  }

  public List<RecommendationHistoryEntry> buildHistoryForPlant(Plant plant, int limit) {
    if (plant == null || plant.getId() == null) {
      return List.of();
    }
    int normalizedLimit = Math.max(1, Math.min(100, limit));
    List<RecommendationSnapshot> rawSnapshots = recommendationSnapshotService.listForPlant(plant, normalizedLimit + 1);
    if (rawSnapshots.isEmpty()) {
      return List.of();
    }

    List<RecommendationHistoryEntry> entries = new ArrayList<>();
    for (int index = 0; index < rawSnapshots.size(); index++) {
      RecommendationSnapshot current = rawSnapshots.get(index);
      RecommendationSnapshot previous = index + 1 < rawSnapshots.size() ? rawSnapshots.get(index + 1) : null;
      RecommendationHistoryEventType eventType = deriveEventType(current, previous, plant, index, rawSnapshots.size());
      RecommendationHistorySource source = deriveSource(eventType);
      SeedStage currentSeedStage = deriveSeedStage(current, plant, index == 0);
      SeedStage previousSeedStage = deriveSeedStage(previous, plant, false);
      PlantGrowthStage currentGrowthStage = deriveGrowthStage(current, plant, index == 0);
      PlantGrowthStage previousGrowthStage = deriveGrowthStage(previous, plant, false);

      RecommendationHistoryEntry entry = diffEngine.buildEntry(
          new RecommendationHistoryDiffEngine.RecommendationHistoryBuildRequest(
              plant.getId(),
              current,
              previous,
              eventType,
              source,
              currentManualOverride(current, plant, index == 0),
              currentManualOverride(previous, plant, false),
              currentGrowthStage,
              previousGrowthStage,
              currentSeedStage,
              previousSeedStage
          )
      );
      if (entry.meaningfulChange() || isAlwaysVisible(eventType)) {
        entries.add(entry);
      }
      if (entries.size() >= normalizedLimit) {
        break;
      }
    }
    return entries;
  }

  private RecommendationHistoryEventType deriveEventType(RecommendationSnapshot current,
                                                         RecommendationSnapshot previous,
                                                         Plant plant,
                                                         int index,
                                                         int totalSnapshots) {
    if (current == null) {
      return RecommendationHistoryEventType.REFRESH_RECOMMENDATION_CHANGED;
    }
    String summary = normalize(current.getSummary());
    String reasoning = normalize(current.getReasoningJson());
    String combined = (summary + " " + reasoning).trim().toLowerCase(Locale.ROOT);

    if (index == totalSnapshots - 1 || isInitialRecommendation(summary, previous)) {
      return RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED;
    }
    if (combined.contains("migration from seed mode")
        || combined.contains("переведено из режима проращивания")) {
      return RecommendationHistoryEventType.MIGRATED_FROM_SEED;
    }
    if (current.getFlow() == RecommendationSnapshotFlow.SCHEDULED
        || combined.contains("scheduled heuristic recalculation")
        || combined.contains("scheduler legacy heuristic path")) {
      return RecommendationHistoryEventType.SCHEDULED_RECALCULATION_CHANGED;
    }
    if (combined.contains("режим обновлён вручную")
        || combined.contains("режим зафиксирован вручную")
        || combined.contains("manual override")
        || combined.contains("пользовательский manual override")) {
      return RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED;
    }
    if (plant != null && plant.getCategory() == com.example.plantbot.domain.PlantCategory.SEED_START) {
      SeedStage currentStage = deriveSeedStage(current, plant, index == 0);
      SeedStage previousStage = deriveSeedStage(previous, plant, false);
      if (currentStage != null && previousStage != null && currentStage != previousStage) {
        return RecommendationHistoryEventType.SEED_STAGE_CHANGE;
      }
    }
    if (combined.contains("сезон")) {
      return RecommendationHistoryEventType.SEASONAL_CHANGE;
    }
    if (current.getSource() == RecommendationSource.WEATHER_ADJUSTED
        || current.getWeatherContextSnapshotJson() != null && !current.getWeatherContextSnapshotJson().isBlank()) {
      return RecommendationHistoryEventType.WEATHER_DRIVEN_CHANGE;
    }
    return RecommendationHistoryEventType.REFRESH_RECOMMENDATION_CHANGED;
  }

  private RecommendationHistorySource deriveSource(RecommendationHistoryEventType eventType) {
    return switch (eventType) {
      case INITIAL_RECOMMENDATION_APPLIED -> RecommendationHistorySource.CREATE_FLOW;
      case MANUAL_RECOMMENDATION_APPLIED, MANUAL_OVERRIDE_APPLIED, MANUAL_OVERRIDE_REMOVED -> RecommendationHistorySource.APPLY_FLOW;
      case SCHEDULED_RECALCULATION_CHANGED -> RecommendationHistorySource.SCHEDULED_FLOW;
      case WEATHER_DRIVEN_CHANGE, SEASONAL_CHANGE -> RecommendationHistorySource.REFRESH_FLOW;
      case SEED_STAGE_CHANGE -> RecommendationHistorySource.SEED_FLOW;
      case MIGRATED_FROM_SEED -> RecommendationHistorySource.SEED_MIGRATION_FLOW;
      case PLANT_PROFILE_CHANGE -> RecommendationHistorySource.PROFILE_EDIT_FLOW;
      default -> RecommendationHistorySource.REFRESH_FLOW;
    };
  }

  private boolean isAlwaysVisible(RecommendationHistoryEventType eventType) {
    return eventType == RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED
        || eventType == RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED
        || eventType == RecommendationHistoryEventType.MIGRATED_FROM_SEED
        || eventType == RecommendationHistoryEventType.SEED_STAGE_CHANGE;
  }

  private boolean isInitialRecommendation(String summary, RecommendationSnapshot previous) {
    return previous == null
        || "initial baseline".equalsIgnoreCase(summary)
        || "initial recommendation snapshot on plant create.".equalsIgnoreCase(summary);
  }

  private Boolean currentManualOverride(RecommendationSnapshot snapshot, Plant plant, boolean latest) {
    if (snapshot == null) {
      return null;
    }
    if (latest && plant != null) {
      return plant.getManualOverrideActive();
    }
    return snapshot.getSource() == RecommendationSource.MANUAL;
  }

  private SeedStage deriveSeedStage(RecommendationSnapshot snapshot, Plant plant, boolean latest) {
    if (snapshot == null) {
      return null;
    }
    if (latest && plant != null && plant.getSeedStage() != null) {
      return plant.getSeedStage();
    }
    String payload = normalize(snapshot.getReasoningJson()) + " " + normalize(snapshot.getSummary());
    return firstEnumMention(payload, SeedStage.values());
  }

  private PlantGrowthStage deriveGrowthStage(RecommendationSnapshot snapshot, Plant plant, boolean latest) {
    if (snapshot == null) {
      return null;
    }
    if (latest && plant != null && plant.getGrowthStage() != null) {
      return plant.getGrowthStage();
    }
    String payload = normalize(snapshot.getReasoningJson()) + " " + normalize(snapshot.getSummary());
    return firstEnumMention(payload, PlantGrowthStage.values());
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim();
  }

  private <E extends Enum<E>> E firstEnumMention(String payload, E[] values) {
    if (payload == null || payload.isBlank() || values == null) {
      return null;
    }
    String normalized = payload.toUpperCase(Locale.ROOT);
    for (E value : values) {
      if (normalized.contains(value.name())) {
        return value;
      }
    }
    return null;
  }
}
