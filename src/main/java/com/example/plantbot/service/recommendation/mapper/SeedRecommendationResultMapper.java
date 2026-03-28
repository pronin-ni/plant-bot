package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewResponse;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
public class SeedRecommendationResultMapper {

  public RecommendationResult fromPreviewResponse(SeedRecommendationPreviewResponse response,
                                                  RecommendationRequestContext context) {
    RecommendationExecutionMode mode = context == null || context.mode() == null
        ? RecommendationExecutionMode.AI
        : context.mode();
    List<RecommendationFactor> factors = new ArrayList<>();
    if (response != null && response.seedStage() != null) {
      factors.add(new RecommendationFactor("SEED_STAGE", "Seed stage", response.seedStage().name(), null, true));
    }
    if (response != null && response.targetEnvironmentType() != null) {
      factors.add(new RecommendationFactor("TARGET_ENV", "Target environment", response.targetEnvironmentType().name(), null, true));
    }
    if (response != null && response.careMode() != null) {
      factors.add(new RecommendationFactor("CARE_MODE", "Seed care mode", response.careMode(), null, true));
    }
    if (response != null && response.recommendedCheckIntervalHours() != null) {
      factors.add(new RecommendationFactor("CHECK_INTERVAL_HOURS", "Check interval", String.valueOf(response.recommendedCheckIntervalHours()), null, true));
    }
    if (response != null && response.recommendedWateringMode() != null) {
      factors.add(new RecommendationFactor("WATERING_MODE", "Seed watering mode", response.recommendedWateringMode().name(), null, true));
    }
    if (response != null && response.expectedGerminationDaysMin() != null) {
      String max = response.expectedGerminationDaysMax() == null ? "?" : String.valueOf(response.expectedGerminationDaysMax());
      factors.add(new RecommendationFactor("GERMINATION_WINDOW", "Expected germination window", response.expectedGerminationDaysMin() + "-" + max, null, true));
    }
    if (context != null && context.underCover() != null) {
      factors.add(new RecommendationFactor("UNDER_COVER", "Under cover", String.valueOf(context.underCover()), null, true));
    }
    if (context != null && context.growLight() != null) {
      factors.add(new RecommendationFactor("GROW_LIGHT", "Grow light", String.valueOf(context.growLight()), null, true));
    }
    if (context != null && context.locationContext() != null && context.locationContext().displayName() != null) {
      factors.add(new RecommendationFactor("LOCATION", "Seed location", context.locationContext().displayName(), null, true));
    }

    RecommendationExplainability explainability = new RecommendationExplainability(
        response == null ? null : response.source(),
        mode,
        response == null ? null : response.summary(),
        response == null || response.reasoning() == null ? List.of() : response.reasoning(),
        response == null || response.warnings() == null ? List.of() : response.warnings(),
        factors,
        context == null || context.weatherContext() == null ? null : context.weatherContext().locationDisplayName(),
        null,
        response != null && !"FALLBACK".equalsIgnoreCase(response.source()) ? "Seed AI/fallback branch" : null,
        null,
        null
    );

    return new RecommendationResult(
        null,
        null,
        response == null ? null : response.source(),
        mode,
        null,
        explainability,
        context == null ? null : context.weatherContext(),
        null,
        Instant.now(),
        false
    );
  }
}
