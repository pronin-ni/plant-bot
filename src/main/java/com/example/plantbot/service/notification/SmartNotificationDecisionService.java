package com.example.plantbot.service.notification;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class SmartNotificationDecisionService {

  public Optional<SmartNotificationDecision> decide(Plant plant, RecommendationResult result, LocalDate today) {
    if (plant == null || result == null || today == null) {
      return Optional.empty();
    }
    if (today.equals(plant.getLastReminderDate())) {
      return Optional.empty();
    }

    if (isSeedPlant(plant)) {
      return decideSeed(plant, today);
    }

    int intervalDays = Math.max(1, safeInt(result.recommendedIntervalDays(), plant.getRecommendedIntervalDays(), plant.getBaseIntervalDays(), 1));
    LocalDate dueDate = plant.getLastWateredDate().plusDays(intervalDays);
    long dueInDays = ChronoUnit.DAYS.between(today, dueDate);
    boolean manual = isManual(plant, result);
    boolean fallback = isFallback(plant, result);
    boolean weather = isWeatherAffected(result);
    boolean relaxed = intervalDays > Math.max(1, plant.getBaseIntervalDays());
    boolean tightened = intervalDays < Math.max(1, plant.getBaseIntervalDays());
    boolean meaningfulChange = isMeaningfulRecommendationChange(plant, result);

    if (dueInDays < 0) {
      return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
          SmartNotificationType.WATER_NOW,
          SmartNotificationPriority.HIGH,
          true,
          false,
          meaningfulChange,
          weather,
          manual,
          fallback,
          false,
          dueDate,
          "Plant is overdue for watering"
      ));
    }

    if (dueInDays == 0) {
      if (weather && relaxed) {
        return Optional.of(new SmartNotificationDecision(
            SmartNotificationType.CAN_DELAY_WATERING,
            SmartNotificationPriority.LOW,
            false,
            true,
            meaningfulChange,
            true,
            manual,
            fallback,
            false,
            dueDate,
            "Weather suggests watering can be delayed"
        ));
      }
      return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
          SmartNotificationType.WATER_NOW,
          SmartNotificationPriority.HIGH,
          true,
          false,
          meaningfulChange,
          weather,
          manual,
          fallback,
          false,
          dueDate,
          "Plant is due today"
      ));
    }

    if (dueInDays == 1 && (tightened || weather)) {
      return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
          SmartNotificationType.WATER_SOON,
          tightened ? SmartNotificationPriority.HIGH : SmartNotificationPriority.MEDIUM,
          true,
          false,
          meaningfulChange,
          weather,
          manual,
          fallback,
          false,
          dueDate,
          "Recommendation suggests near-term watering attention"
      ));
    }

    if (meaningfulChange && weather) {
      if (relaxed) {
        return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
            SmartNotificationType.CAN_DELAY_WATERING,
            SmartNotificationPriority.LOW,
            false,
            true,
            true,
            true,
            manual,
            fallback,
            false,
            dueDate,
            "Weather reduced watering urgency"
        ));
      }
      return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
          SmartNotificationType.WEATHER_ALERT,
          tightened ? SmartNotificationPriority.HIGH : SmartNotificationPriority.MEDIUM,
          tightened,
          false,
          true,
          true,
          manual,
          fallback,
          false,
          dueDate,
          "Weather changed the recommendation meaningfully"
      ));
    }

    if (meaningfulChange) {
      SmartNotificationType type = manual
          ? SmartNotificationType.MANUAL_MODE_NOTICE
          : fallback
              ? SmartNotificationType.FALLBACK_MODE_NOTICE
              : SmartNotificationType.RECOMMENDATION_CHANGED;
      return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
          type,
          SmartNotificationPriority.MEDIUM,
          false,
          true,
          true,
          weather,
          manual,
          fallback,
          false,
          dueDate,
          "Recommendation changed meaningfully"
      ));
    }

    return Optional.empty();
  }

  private boolean suppressByCooldown(Plant plant, LocalDate today, SmartNotificationType type) {
    if (plant == null || plant.getLastReminderDate() == null || today == null) {
      return false;
    }
    long daysSinceLastReminder = ChronoUnit.DAYS.between(plant.getLastReminderDate(), today);
    return switch (type) {
      case WATER_NOW -> daysSinceLastReminder < 1;
      case WATER_SOON, CAN_DELAY_WATERING -> daysSinceLastReminder < 2;
      case RECOMMENDATION_CHANGED, WEATHER_ALERT, MANUAL_MODE_NOTICE, FALLBACK_MODE_NOTICE -> daysSinceLastReminder < 2;
      case SEED_ACTION_DUE, STAGE_CHANGE_NOTICE -> daysSinceLastReminder < 1;
    };
  }

  private Optional<SmartNotificationDecision> allowIfNotCoolingDown(Plant plant, LocalDate today, SmartNotificationDecision decision) {
    if (decision == null) {
      return Optional.empty();
    }
    if (suppressByCooldown(plant, today, decision.type())) {
      return Optional.empty();
    }
    return Optional.of(decision);
  }

  private Optional<SmartNotificationDecision> decideSeed(Plant plant, LocalDate today) {
    LocalDate dueDate = plant.getLastWateredDate().plusDays(1);
    long dueInDays = ChronoUnit.DAYS.between(today, dueDate);
    SeedStage stage = plant.getSeedStage();
    boolean actionDue = dueInDays <= 0 || plant.getRecommendedCheckIntervalHours() != null;
    if (!actionDue) {
      return Optional.empty();
    }
    SmartNotificationType type = stage == SeedStage.SPROUTED || stage == SeedStage.SEEDLING || stage == SeedStage.READY_TO_TRANSPLANT
        ? SmartNotificationType.STAGE_CHANGE_NOTICE
        : SmartNotificationType.SEED_ACTION_DUE;
    SmartNotificationPriority priority = stage == SeedStage.READY_TO_TRANSPLANT || stage == SeedStage.SEEDLING
        ? SmartNotificationPriority.HIGH
        : SmartNotificationPriority.MEDIUM;
    return allowIfNotCoolingDown(plant, today, new SmartNotificationDecision(
        type,
        priority,
        true,
        false,
        false,
        false,
        false,
        false,
        true,
        dueDate,
        "Seed stage requires a check or action"
    ));
  }

  private boolean isSeedPlant(Plant plant) {
    return plant.getCategory() == PlantCategory.SEED_START || plant.getSeedStage() != null;
  }

  private boolean isManual(Plant plant, RecommendationResult result) {
    if (result.manualOverrideActive() || Boolean.TRUE.equals(plant.getManualOverrideActive())) {
      return true;
    }
    String source = normalize(result.source(), plant.getRecommendationSource() == null ? null : plant.getRecommendationSource().name());
    RecommendationExplainability explainability = result.explainability();
    return source.contains("manual") || (explainability != null && normalize(explainability.manualOverrideContribution()).contains("руч"));
  }

  private boolean isFallback(Plant plant, RecommendationResult result) {
    String source = normalize(result.source(), plant.getRecommendationSource() == null ? null : plant.getRecommendationSource().name());
    RecommendationExplainability explainability = result.explainability();
    return source.contains("fallback")
        || source.contains("heuristic")
        || source.contains("base_profile")
        || (explainability != null && normalize(explainability.summary()).contains("резерв"));
  }

  private boolean isWeatherAffected(RecommendationResult result) {
    RecommendationExplainability explainability = result.explainability();
    if (explainability == null) {
      return false;
    }
    if (normalize(explainability.weatherContribution()).contains("погод") || normalize(explainability.weatherContribution()).contains("дожд") || normalize(explainability.weatherContribution()).contains("жар")) {
      return true;
    }
    List<RecommendationFactor> factors = explainability.factors();
    return factors != null && factors.stream().filter(RecommendationFactor::applied).anyMatch(factor -> {
      String joined = normalize(factor.kind(), factor.label(), factor.effect());
      return joined.contains("weather") || joined.contains("погод") || joined.contains("осад") || joined.contains("rain") || joined.contains("heat") || joined.contains("жар");
    });
  }

  private boolean isMeaningfulRecommendationChange(Plant plant, RecommendationResult result) {
    Integer previousInterval = plant.getRecommendedIntervalDays();
    Integer newInterval = result.recommendedIntervalDays();
    Integer previousWater = plant.getRecommendedWaterVolumeMl();
    Integer newWater = result.recommendedWaterMl();
    return isMeaningfulIntervalDelta(previousInterval, newInterval) || isMeaningfulWaterDelta(previousWater, newWater);
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

  private int safeInt(Integer primary, Integer secondary, Integer tertiary, int fallback) {
    if (primary != null && primary > 0) return primary;
    if (secondary != null && secondary > 0) return secondary;
    if (tertiary != null && tertiary > 0) return tertiary;
    return fallback;
  }

  private String normalize(String... values) {
    StringBuilder builder = new StringBuilder();
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        if (builder.length() > 0) builder.append(' ');
        builder.append(value.trim().toLowerCase(Locale.ROOT));
      }
    }
    return builder.toString();
  }
}
