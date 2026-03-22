package com.example.plantbot.service.recommendation.facade;

import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;

public interface RecommendationFacade {
  RecommendationResult preview(RecommendationRequestContext context);

  RecommendationResult runtime(RecommendationRequestContext context);

  RecommendationResult scheduled(RecommendationRequestContext context);

  RecommendationResult explain(RecommendationRequestContext context);
}
