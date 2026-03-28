package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.Plant;
import org.springframework.stereotype.Component;

@Component
public class RecommendationPersistencePlanApplier {

  public void apply(Plant plant, RecommendationPersistencePlan plan) {
    if (plant == null) {
      throw new IllegalArgumentException("plant is required");
    }
    if (plan == null) {
      throw new IllegalArgumentException("plan is required");
    }

    plant.setBaseIntervalDays(plan.baselineIntervalDays());
    plant.setPreferredWaterMl(plan.baselineWaterMl());

    plant.setRecommendedIntervalDays(plan.appliedIntervalDays());
    plant.setRecommendedWaterVolumeMl(plan.appliedWaterMl());
    plant.setRecommendationSource(plan.appliedSource());
    plant.setRecommendationSummary(plan.appliedSummary());
    plant.setRecommendationReasoningJson(plan.appliedReasoningJson());
    plant.setRecommendationWarningsJson(plan.appliedWarningsJson());
    plant.setConfidenceScore(plan.appliedConfidenceScore());
    plant.setGeneratedAt(plan.appliedGeneratedAt());

    plant.setManualOverrideActive(plan.manualOverrideActive());
    plant.setManualWaterVolumeMl(plan.manualWaterVolumeMl());

    plant.setLastRecommendationSource(plan.lastRecommendationSource());
    plant.setLastRecommendedIntervalDays(plan.lastRecommendedIntervalDays());
    plant.setLastRecommendedWaterMl(plan.lastRecommendedWaterMl());
    plant.setLastRecommendationSummary(plan.lastRecommendationSummary());
    plant.setLastRecommendationUpdatedAt(plan.lastRecommendationUpdatedAt());
  }
}
