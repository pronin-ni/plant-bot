package com.example.plantbot.service.recommendation.facade;

import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import org.springframework.stereotype.Service;

@Service
public class DefaultRecommendationFacade implements RecommendationFacade {
  @Override
  public RecommendationResult preview(RecommendationRequestContext context) {
    throw unsupported("preview", context);
  }

  @Override
  public RecommendationResult runtime(RecommendationRequestContext context) {
    throw unsupported("runtime", context);
  }

  @Override
  public RecommendationResult scheduled(RecommendationRequestContext context) {
    throw unsupported("scheduled", context);
  }

  @Override
  public RecommendationResult explain(RecommendationRequestContext context) {
    throw unsupported("explain", context);
  }

  private UnsupportedOperationException unsupported(String operation, RecommendationRequestContext context) {
    String flow = context == null || context.flowType() == null ? "unknown" : context.flowType().name();
    return new UnsupportedOperationException(
        "Unified recommendation facade skeleton is not wired yet. operation=" + operation + ", flowType=" + flow
    );
  }
}
