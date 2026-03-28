package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecommendationExplainabilityPersistenceMapperTest {

  private final RecommendationExplainabilityPersistenceMapper mapper =
      new RecommendationExplainabilityPersistenceMapper(new ObjectMapper());

  @Test
  void fromExplainabilityPersistsSummaryReasoningAndWarningsConsistently() {
    PersistedRecommendationExplainability persisted = mapper.fromExplainability(
        new RecommendationExplainability(
            "HYBRID",
            RecommendationExecutionMode.HYBRID,
            "Summary text",
            List.of("r1", "r2"),
            List.of("w1"),
            List.of(),
            "weather",
            "sensor",
            "ai",
            "learning",
            "manual"
        )
    );

    assertEquals("Summary text", persisted.summary());
    assertEquals("[\"r1\",\"r2\"]", persisted.reasoningJson());
    assertEquals("[\"w1\"]", persisted.warningsJson());
  }

  @Test
  void fromSummaryOnlyCreatesCompactButValidExplainabilityPayload() {
    PersistedRecommendationExplainability persisted = mapper.fromSummaryOnly("Applied manually");

    assertEquals("Applied manually", persisted.summary());
    assertEquals("[]", persisted.reasoningJson());
    assertEquals("[]", persisted.warningsJson());
  }
}
