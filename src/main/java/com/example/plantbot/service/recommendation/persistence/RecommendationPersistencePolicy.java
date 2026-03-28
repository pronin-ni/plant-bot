package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.Plant;

public interface RecommendationPersistencePolicy {
  RecommendationPersistencePlan buildPlan(
      Plant plant,
      RecommendationPersistenceCommand command,
      RecommendationPersistenceFlow flow
  );
}
