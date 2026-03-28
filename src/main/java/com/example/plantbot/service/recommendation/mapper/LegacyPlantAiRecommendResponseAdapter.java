package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.PlantAiRecommendResponse;
import com.example.plantbot.service.recommendation.model.RecommendationFactor;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class LegacyPlantAiRecommendResponseAdapter {

  public PlantAiRecommendResponse adapt(RecommendationResult result, RecommendationRequestContext context) {
    return new PlantAiRecommendResponse(
        result == null ? null : result.source(),
        result == null ? null : result.recommendedIntervalDays(),
        result == null ? null : result.recommendedWaterMl(),
        result == null || result.explainability() == null ? null : result.explainability().summary(),
        result == null || result.explainability() == null || result.explainability().reasoning() == null ? List.of() : result.explainability().reasoning(),
        result == null || result.explainability() == null || result.explainability().warnings() == null ? List.of() : result.explainability().warnings(),
        resolveProfile(result, context)
    );
  }

  private String resolveProfile(RecommendationResult result, RecommendationRequestContext context) {
    String profile = factorValue(result, "PROFILE");
    if (profile != null && !profile.isBlank()) {
      return profile;
    }
    if (context != null && context.environmentType() != null) {
      return context.environmentType().name();
    }
    return null;
  }

  private String factorValue(RecommendationResult result, String kind) {
    if (result == null || result.explainability() == null || result.explainability().factors() == null) {
      return null;
    }
    for (RecommendationFactor factor : result.explainability().factors()) {
      if (factor != null && kind.equals(factor.kind())) {
        return factor.effect();
      }
    }
    return null;
  }
}
