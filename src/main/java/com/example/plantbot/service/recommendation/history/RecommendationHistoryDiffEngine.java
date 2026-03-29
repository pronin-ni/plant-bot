package com.example.plantbot.service.recommendation.history;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryChangeSignificance;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEventType;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryFactorSummary;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistorySource;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Component
public class RecommendationHistoryDiffEngine {
  private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
  };

  private final ObjectMapper objectMapper;

  public RecommendationHistoryDiffEngine(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public RecommendationHistoryEntry buildEntry(RecommendationHistoryBuildRequest request) {
    RecommendationSnapshot current = request == null ? null : request.currentSnapshot();
    if (current == null) {
      throw new IllegalArgumentException("currentSnapshot is required");
    }

    RecommendationSnapshot previous = request.previousSnapshot();
    Integer previousInterval = previous == null ? null : previous.getRecommendedIntervalDays();
    Integer newInterval = current.getRecommendedIntervalDays();
    Integer previousWater = previous == null ? null : previous.getRecommendedWaterVolumeMl();
    Integer newWater = current.getRecommendedWaterVolumeMl();

    Integer deltaInterval = previousInterval == null || newInterval == null ? null : newInterval - previousInterval;
    Integer deltaWater = previousWater == null || newWater == null ? null : newWater - previousWater;

    List<String> reasoning = parseList(current.getReasoningJson());
    List<String> warnings = parseList(current.getWarningsJson());
    ContributionFlags contributionFlags = detectContributions(request, current, reasoning, warnings);
    RecommendationHistoryChangeSignificance significance = determineSignificance(
        request,
        previousInterval,
        newInterval,
        previousWater,
        newWater,
        warnings,
        contributionFlags
    );
    boolean meaningfulChange = significance != RecommendationHistoryChangeSignificance.MINOR
        || isAlwaysVisibleEvent(request.eventType());
    boolean userActionRequired = hasActionRequiredWarning(warnings)
        || request.eventType() == RecommendationHistoryEventType.MIGRATED_FROM_SEED
        || request.eventType() == RecommendationHistoryEventType.SEED_STAGE_CHANGE;

    return new RecommendationHistoryEntry(
        current.getId(),
        current.getPlant() == null ? request.plantId() : current.getPlant().getId(),
        current.getCreatedAt() == null ? current.getGeneratedAt() : current.getCreatedAt(),
        request.eventType(),
        request.source(),
        current.getSource(),
        previousInterval,
        newInterval,
        previousWater,
        newWater,
        deltaInterval,
        deltaWater,
        current.getSummary(),
        reasoning,
        warnings,
        buildFactors(request, deltaInterval, deltaWater, warnings, contributionFlags),
        request.currentManualOverrideActive(),
        contributionFlags.weatherContribution,
        contributionFlags.aiContribution,
        contributionFlags.seasonContribution,
        contributionFlags.learningContribution,
        request.currentGrowthStage(),
        request.previousGrowthStage(),
        request.currentSeedStage(),
        request.previousSeedStage(),
        meaningfulChange,
        significance,
        userActionRequired
    );
  }

  private RecommendationHistoryChangeSignificance determineSignificance(RecommendationHistoryBuildRequest request,
                                                                       Integer previousInterval,
                                                                       Integer newInterval,
                                                                       Integer previousWater,
                                                                       Integer newWater,
                                                                       List<String> warnings,
                                                                       ContributionFlags flags) {
    if (request.eventType() == RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED) {
      return RecommendationHistoryChangeSignificance.INFO_ONLY;
    }
    if (request.eventType() == RecommendationHistoryEventType.MIGRATED_FROM_SEED
        || request.eventType() == RecommendationHistoryEventType.MANUAL_OVERRIDE_APPLIED
        || request.eventType() == RecommendationHistoryEventType.MANUAL_OVERRIDE_REMOVED
        || request.eventType() == RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED) {
      return RecommendationHistoryChangeSignificance.MAJOR;
    }
    if (request.eventType() == RecommendationHistoryEventType.SEED_STAGE_CHANGE
        || request.eventType() == RecommendationHistoryEventType.GROWTH_STAGE_CHANGE) {
      return RecommendationHistoryChangeSignificance.MODERATE;
    }

    boolean intervalChanged = isMeaningfulIntervalDelta(previousInterval, newInterval);
    boolean waterChanged = isMeaningfulWaterDelta(previousWater, newWater);
    boolean warningChanged = hasActionRequiredWarning(warnings) || flags.degradedWarning;

    if (intervalChanged && waterChanged) {
      return RecommendationHistoryChangeSignificance.MAJOR;
    }
    if (intervalChanged || waterChanged || warningChanged) {
      return RecommendationHistoryChangeSignificance.MODERATE;
    }
    if (flags.weatherContribution != null || flags.aiContribution != null || flags.seasonContribution != null) {
      return RecommendationHistoryChangeSignificance.MINOR;
    }
    return RecommendationHistoryChangeSignificance.MINOR;
  }

  private boolean isMeaningfulIntervalDelta(Integer previousInterval, Integer newInterval) {
    if (previousInterval == null || newInterval == null) {
      return false;
    }
    int absoluteDelta = Math.abs(newInterval - previousInterval);
    if (absoluteDelta >= 1) {
      return true;
    }
    double relativeDelta = previousInterval <= 0 ? 0.0 : absoluteDelta / (double) previousInterval;
    return relativeDelta >= 0.20d;
  }

  private boolean isMeaningfulWaterDelta(Integer previousWater, Integer newWater) {
    if (previousWater == null || newWater == null) {
      return false;
    }
    int absoluteDelta = Math.abs(newWater - previousWater);
    if (absoluteDelta >= 50) {
      return true;
    }
    double relativeDelta = previousWater <= 0 ? 0.0 : absoluteDelta / (double) previousWater;
    return relativeDelta >= 0.15d;
  }

  private boolean isAlwaysVisibleEvent(RecommendationHistoryEventType eventType) {
    return eventType == RecommendationHistoryEventType.INITIAL_RECOMMENDATION_APPLIED
        || eventType == RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED
        || eventType == RecommendationHistoryEventType.MANUAL_OVERRIDE_APPLIED
        || eventType == RecommendationHistoryEventType.MANUAL_OVERRIDE_REMOVED
        || eventType == RecommendationHistoryEventType.MIGRATED_FROM_SEED
        || eventType == RecommendationHistoryEventType.SEED_STAGE_CHANGE;
  }

  private boolean hasActionRequiredWarning(List<String> warnings) {
    if (warnings == null || warnings.isEmpty()) {
      return false;
    }
    return warnings.stream()
        .filter(value -> value != null && !value.isBlank())
        .map(value -> value.toLowerCase(Locale.ROOT))
        .anyMatch(value -> value.contains("проверь")
            || value.contains("внимание")
            || value.contains("degraded mode")
            || value.contains("fallback")
            || value.contains("осторожн"));
  }

  private ContributionFlags detectContributions(RecommendationHistoryBuildRequest request,
                                                RecommendationSnapshot snapshot,
                                                List<String> reasoning,
                                                List<String> warnings) {
    Set<String> allText = new LinkedHashSet<>();
    allText.add(snapshot.getSummary());
    allText.addAll(reasoning);
    allText.addAll(warnings);

    String lowered = allText.stream()
        .filter(value -> value != null && !value.isBlank())
        .map(value -> value.toLowerCase(Locale.ROOT))
        .reduce("", (left, right) -> left + " " + right);

    String weatherContribution = null;
    if ((snapshot.getWeatherContextSnapshotJson() != null && !snapshot.getWeatherContextSnapshotJson().isBlank())
        || lowered.contains("погод")
        || lowered.contains("дожд")
        || lowered.contains("осад")) {
      weatherContribution = "Погодный контекст повлиял на пересчёт режима.";
    }

    String aiContribution = null;
    if (snapshot.getSource() == RecommendationSource.AI || snapshot.getSource() == RecommendationSource.HYBRID) {
      aiContribution = "AI участвовал в формировании рекомендации.";
    } else if (lowered.contains("ai ")) {
      aiContribution = "AI участвовал в формировании рекомендации.";
    }

    String seasonContribution = null;
    if (request.eventType() == RecommendationHistoryEventType.SEASONAL_CHANGE
        || lowered.contains("сезон")) {
      seasonContribution = "Смена сезона повлияла на режим ухода.";
    }

    String learningContribution = null;
    if (lowered.contains("истори")
        || lowered.contains("привыч")
        || lowered.contains("локальные датчики")) {
      learningContribution = "История ухода или связанные контексты повлияли на пересчёт.";
    }

    boolean degradedWarning = lowered.contains("degraded mode")
        || lowered.contains("fallback")
        || lowered.contains("осторожн");

    return new ContributionFlags(weatherContribution, aiContribution, seasonContribution, learningContribution, degradedWarning);
  }

  private List<RecommendationHistoryFactorSummary> buildFactors(RecommendationHistoryBuildRequest request,
                                                                Integer deltaInterval,
                                                                Integer deltaWater,
                                                                List<String> warnings,
                                                                ContributionFlags flags) {
    List<RecommendationHistoryFactorSummary> factors = new ArrayList<>();
    if (flags.weatherContribution != null) {
      factors.add(new RecommendationHistoryFactorSummary(
          "WEATHER",
          "Погода",
          flags.weatherContribution,
          intervalDirection(deltaInterval)
      ));
    }
    if (flags.aiContribution != null) {
      factors.add(new RecommendationHistoryFactorSummary(
          "AI",
          "AI",
          flags.aiContribution,
          waterDirection(deltaWater)
      ));
    }
    if (request.eventType() == RecommendationHistoryEventType.MANUAL_RECOMMENDATION_APPLIED
        || request.eventType() == RecommendationHistoryEventType.MANUAL_OVERRIDE_APPLIED
        || request.eventType() == RecommendationHistoryEventType.MANUAL_OVERRIDE_REMOVED) {
      factors.add(new RecommendationHistoryFactorSummary(
          "MANUAL",
          "Ручная настройка",
          "Пользователь изменил режим ухода вручную.",
          "NO_NUMERIC_CHANGE"
      ));
    }
    if (request.eventType() == RecommendationHistoryEventType.SEED_STAGE_CHANGE && request.currentSeedStage() != null) {
      factors.add(new RecommendationHistoryFactorSummary(
          "SEED_STAGE",
          "Стадия проращивания",
          "Стадия изменилась: " + request.currentSeedStage().name(),
          "STAGE_TRANSITION"
      ));
    }
    if (request.eventType() == RecommendationHistoryEventType.GROWTH_STAGE_CHANGE && request.currentGrowthStage() != null) {
      factors.add(new RecommendationHistoryFactorSummary(
          "GROWTH_STAGE",
          "Стадия роста",
          "Стадия изменилась: " + request.currentGrowthStage().name(),
          "STAGE_TRANSITION"
      ));
    }
    if (request.eventType() == RecommendationHistoryEventType.MIGRATED_FROM_SEED) {
      factors.add(new RecommendationHistoryFactorSummary(
          "MIGRATION",
          "Переход из seed-режима",
          "Растение переведено в обычную модель ухода.",
          "STAGE_TRANSITION"
      ));
    }
    if (warnings != null && !warnings.isEmpty() && factors.isEmpty()) {
      factors.add(new RecommendationHistoryFactorSummary(
          "WARNING",
          "Особенности данных",
          warnings.get(0),
          "NO_NUMERIC_CHANGE"
      ));
    }
    return factors;
  }

  private String intervalDirection(Integer deltaInterval) {
    if (deltaInterval == null || deltaInterval == 0) {
      return "NO_NUMERIC_CHANGE";
    }
    return deltaInterval < 0 ? "SHORTENED_INTERVAL" : "EXTENDED_INTERVAL";
  }

  private String waterDirection(Integer deltaWater) {
    if (deltaWater == null || deltaWater == 0) {
      return "NO_NUMERIC_CHANGE";
    }
    return deltaWater > 0 ? "INCREASED_WATER" : "DECREASED_WATER";
  }

  private List<String> parseList(String rawJson) {
    if (rawJson == null || rawJson.isBlank()) {
      return List.of();
    }
    try {
      return objectMapper.readValue(rawJson, STRING_LIST);
    } catch (Exception ex) {
      return List.of(rawJson);
    }
  }

  public record RecommendationHistoryBuildRequest(
      Long plantId,
      RecommendationSnapshot currentSnapshot,
      RecommendationSnapshot previousSnapshot,
      RecommendationHistoryEventType eventType,
      RecommendationHistorySource source,
      Boolean currentManualOverrideActive,
      Boolean previousManualOverrideActive,
      PlantGrowthStage currentGrowthStage,
      PlantGrowthStage previousGrowthStage,
      SeedStage currentSeedStage,
      SeedStage previousSeedStage
  ) {
    public static RecommendationHistoryBuildRequest fromPlant(Plant plant,
                                                              RecommendationSnapshot currentSnapshot,
                                                              RecommendationSnapshot previousSnapshot,
                                                              RecommendationHistoryEventType eventType,
                                                              RecommendationHistorySource source) {
      return new RecommendationHistoryBuildRequest(
          plant == null ? null : plant.getId(),
          currentSnapshot,
          previousSnapshot,
          eventType,
          source,
          plant == null ? null : plant.getManualOverrideActive(),
          null,
          plant == null ? null : plant.getGrowthStage(),
          null,
          plant == null ? null : plant.getSeedStage(),
          null
      );
    }
  }

  private record ContributionFlags(
      String weatherContribution,
      String aiContribution,
      String seasonContribution,
      String learningContribution,
      boolean degradedWarning
  ) {
  }
}
