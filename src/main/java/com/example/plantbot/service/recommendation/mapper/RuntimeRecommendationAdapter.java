package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.util.WateringRecommendation;
import org.springframework.stereotype.Component;

@Component
public class RuntimeRecommendationAdapter {

  public WateringRecommendation adapt(RecommendationResult result) {
    if (result == null) {
      return new WateringRecommendation(7.0, 0.3);
    }

    double intervalDays = result.recommendedIntervalDays() == null
        ? 7.0
        : Math.max(1.0, result.recommendedIntervalDays().doubleValue());

    double waterLiters = result.recommendedWaterMl() == null
        ? 0.3
        : Math.max(0.0, result.recommendedWaterMl() / 1000.0);

    return new WateringRecommendation(intervalDays, waterLiters);
  }
}
