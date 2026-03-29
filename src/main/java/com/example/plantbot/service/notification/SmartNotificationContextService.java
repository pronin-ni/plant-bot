package com.example.plantbot.service.notification;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
public class SmartNotificationContextService {

  public SmartNotificationContext build(Plant plant, RecommendationResult result, SmartNotificationDecision decision) {
    RecommendationExplainability explainability = result == null ? null : result.explainability();
    boolean seedMode = isSeedPlant(plant);
    String explainabilitySummary = explainability == null ? null : clean(explainability.summary());
    String primaryReason = resolvePrimaryReason(plant, result, decision, explainability);
    String stageHint = resolveStageHint(plant);
    String seedActionHint = resolveSeedActionHint(plant);

    return new SmartNotificationContext(
        plant == null ? null : plant.getId(),
        decision.type(),
        decision.priority(),
        decision.actionRequired(),
        decision.silent(),
        decision.recommendationChanged(),
        decision.weatherAffected(),
        decision.manualMode(),
        decision.fallbackMode(),
        seedMode,
        decision.dueDate(),
        plant == null ? null : plant.getRecommendedIntervalDays(),
        result == null ? null : result.recommendedIntervalDays(),
        plant == null ? null : plant.getRecommendedWaterVolumeMl(),
        result == null ? null : result.recommendedWaterMl(),
        explainabilitySummary,
        primaryReason,
        stageHint,
        seedActionHint,
        decision.rationale()
    );
  }

  private String resolvePrimaryReason(Plant plant,
                                      RecommendationResult result,
                                      SmartNotificationDecision decision,
                                      RecommendationExplainability explainability) {
    if (decision.seedMode()) {
      return resolveSeedReason(plant);
    }
    if (decision.manualMode()) {
      return "Сейчас действует ручной режим.";
    }
    if (decision.fallbackMode()) {
      return "Совет собран в резервном режиме.";
    }
    if (decision.weatherAffected()) {
      if (decision.recommendationChanged()) {
        return "Погода изменила режим ухода.";
      }
      return "Учтена текущая погода.";
    }
    String factorReason = fromFactors(explainability == null ? null : explainability.factors());
    if (factorReason != null) {
      return factorReason;
    }
    if (explainability != null) {
      String warning = firstMeaningful(explainability.warnings());
      if (warning != null) {
        return warning;
      }
      String summary = clean(explainability.summary());
      if (summary != null) {
        return summary;
      }
    }
    if (decision.recommendationChanged()) {
      return "Режим ухода заметно изменился.";
    }
    return "Режим ухода подтверждён.";
  }

  private String resolveSeedReason(Plant plant) {
    if (plant == null) {
      return "Пора проверить рассаду.";
    }
    SeedStage stage = plant.getSeedStage();
    if (stage == SeedStage.READY_TO_TRANSPLANT) {
      return "Рассаду пора готовить к следующему этапу.";
    }
    if (stage == SeedStage.SEEDLING) {
      return "Сеянцы требуют более внимательного ухода.";
    }
    if (stage == SeedStage.SPROUTED) {
      return "Появились всходы — стоит проверить уход.";
    }
    if (plant.getRecommendedCheckIntervalHours() != null && plant.getRecommendedCheckIntervalHours() <= 12) {
      return "Пора проверить влажность и состояние рассады.";
    }
    return "Пора проверить рассаду.";
  }

  private String resolveSeedActionHint(Plant plant) {
    if (plant == null || !isSeedPlant(plant)) {
      return null;
    }
    SeedStage stage = plant.getSeedStage();
    if (stage == SeedStage.READY_TO_TRANSPLANT) {
      return "пора готовить к пересадке";
    }
    if (stage == SeedStage.SEEDLING) {
      return plant.getGrowLight() == null || !plant.getGrowLight() ? "перенести под свет" : "проверить сеянец";
    }
    if (stage == SeedStage.SPROUTED) {
      if (Boolean.TRUE.equals(plant.getUnderCover())) {
        return "снять крышку";
      }
      return plant.getGrowLight() == null || !plant.getGrowLight() ? "перенести под свет" : "проверить всходы";
    }
    if (stage == SeedStage.GERMINATING) {
      if (Boolean.TRUE.equals(plant.getUnderCover())) {
        return "проветрить";
      }
      return "проверить влажность";
    }
    return "проверить рассаду";
  }

  private String resolveStageHint(Plant plant) {
    if (plant == null) {
      return null;
    }
    if (plant.getSeedStage() != null) {
      return plant.getSeedStage().name();
    }
    if (plant.getGrowthStage() != null) {
      return plant.getGrowthStage().name();
    }
    return null;
  }

  private String fromFactors(List<RecommendationFactor> factors) {
    if (factors == null) {
      return null;
    }
    for (RecommendationFactor factor : factors) {
      if (!factor.applied()) {
        continue;
      }
      String joined = normalize(factor.kind(), factor.label(), factor.effect());
      if (joined.contains("weather") || joined.contains("погод") || joined.contains("осад") || joined.contains("жар")) {
        return "Учтена текущая погода.";
      }
      if (joined.contains("manual") || joined.contains("руч")) {
        return "Сейчас действует ручной режим.";
      }
      if (joined.contains("seed") || joined.contains("stage") || joined.contains("стади")) {
        return "Стадия растения влияет на уход.";
      }
      String effect = clean(factor.effect());
      if (effect != null) {
        return effect;
      }
    }
    return null;
  }

  private String firstMeaningful(List<String> values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      String cleaned = clean(value);
      if (cleaned != null) {
        return cleaned;
      }
    }
    return null;
  }

  private String clean(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    if (trimmed.isBlank()) {
      return null;
    }
    return trimmed;
  }

  private boolean isSeedPlant(Plant plant) {
    return plant != null && (plant.getCategory() == PlantCategory.SEED_START || plant.getSeedStage() != null);
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
