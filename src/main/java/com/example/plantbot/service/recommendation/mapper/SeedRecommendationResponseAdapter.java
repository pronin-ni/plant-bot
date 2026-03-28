package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewResponse;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedWateringMode;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class SeedRecommendationResponseAdapter {

  public SeedRecommendationPreviewResponse adapt(RecommendationResult result, RecommendationRequestContext context) {
    return new SeedRecommendationPreviewResponse(
        result == null ? null : result.source(),
        context == null || context.seedStage() == null ? SeedStage.SOWN : context.seedStage(),
        context == null ? null : context.targetEnvironmentType(),
        factorValue(result, "CARE_MODE"),
        parseInteger(factorValue(result, "CHECK_INTERVAL_HOURS")),
        parseWateringMode(factorValue(result, "WATERING_MODE")),
        parseWindowMin(result),
        parseWindowMax(result),
        result == null || result.explainability() == null ? null : result.explainability().summary(),
        result == null || result.explainability() == null || result.explainability().reasoning() == null ? List.of() : result.explainability().reasoning(),
        result == null || result.explainability() == null || result.explainability().warnings() == null ? List.of() : result.explainability().warnings()
    );
  }

  private String factorValue(RecommendationResult result, String code) {
    if (result == null || result.explainability() == null || result.explainability().factors() == null) {
      return null;
    }
    for (RecommendationFactor factor : result.explainability().factors()) {
      if (factor != null && code.equals(factor.kind())) {
        return factor.effect();
      }
    }
    return null;
  }

  private Integer parseInteger(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return Integer.parseInt(raw.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private SeedWateringMode parseWateringMode(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return SeedWateringMode.valueOf(raw.trim().toUpperCase());
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }

  private Integer parseWindowMin(RecommendationResult result) {
    String raw = factorValue(result, "GERMINATION_WINDOW");
    if (raw == null || !raw.contains("-")) {
      return null;
    }
    return parseInteger(raw.substring(0, raw.indexOf('-')));
  }

  private Integer parseWindowMax(RecommendationResult result) {
    String raw = factorValue(result, "GERMINATION_WINDOW");
    if (raw == null || !raw.contains("-")) {
      return null;
    }
    return parseInteger(raw.substring(raw.indexOf('-') + 1));
  }
}
