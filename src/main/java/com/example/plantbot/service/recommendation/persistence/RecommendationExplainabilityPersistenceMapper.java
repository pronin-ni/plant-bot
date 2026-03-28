package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RecommendationExplainabilityPersistenceMapper {
  private final ObjectMapper objectMapper;

  public RecommendationExplainabilityPersistenceMapper(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public PersistedRecommendationExplainability fromExplainability(RecommendationExplainability explainability) {
    if (explainability == null) {
      return new PersistedRecommendationExplainability(null, null, null);
    }
    return new PersistedRecommendationExplainability(
        normalizeSummary(explainability.summary()),
        writeJsonSafe(explainability.reasoning() == null ? List.of() : explainability.reasoning()),
        writeJsonSafe(explainability.warnings() == null ? List.of() : explainability.warnings())
    );
  }

  public PersistedRecommendationExplainability fromLegacy(String summary, String reasoningJson, String warningsJson) {
    return new PersistedRecommendationExplainability(
        normalizeSummary(summary),
        reasoningJson,
        warningsJson
    );
  }

  public PersistedRecommendationExplainability fromSummaryOnly(String summary) {
    return new PersistedRecommendationExplainability(
        normalizeSummary(summary),
        writeJsonSafe(List.of()),
        writeJsonSafe(List.of())
    );
  }

  private String normalizeSummary(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isBlank() ? null : trimmed;
  }

  private String writeJsonSafe(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      return null;
    }
  }
}
