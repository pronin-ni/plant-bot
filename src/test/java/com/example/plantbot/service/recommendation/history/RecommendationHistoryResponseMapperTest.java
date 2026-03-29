package com.example.plantbot.service.recommendation.history;

import com.example.plantbot.controller.dto.RecommendationHistoryResponseDto;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryChangeSignificance;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEventType;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryFactorSummary;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistorySource;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class RecommendationHistoryResponseMapperTest {

  @Test
  void compactResponseTrimsVerboseFields() {
    RecommendationHistoryResponseMapper mapper = new RecommendationHistoryResponseMapper();
    RecommendationHistoryEntry entry = new RecommendationHistoryEntry(
        1L,
        10L,
        Instant.parse("2026-03-28T10:15:30Z"),
        RecommendationHistoryEventType.WEATHER_DRIVEN_CHANGE,
        RecommendationHistorySource.REFRESH_FLOW,
        RecommendationSource.WEATHER_ADJUSTED,
        7,
        5,
        300,
        450,
        -2,
        150,
        "Полив стал чаще из-за жары",
        List.of("r1", "r2", "r3", "r4"),
        List.of("w1", "w2", "w3"),
        List.of(
            new RecommendationHistoryFactorSummary("WEATHER", "Погода", "Стало суше", "SHORTENED_INTERVAL"),
            new RecommendationHistoryFactorSummary("AI", "AI", "AI помог", "INCREASED_WATER"),
            new RecommendationHistoryFactorSummary("SEASON", "Сезон", "Весна", "NO_NUMERIC_CHANGE")
        ),
        false,
        "weather",
        "ai",
        "season",
        "learning",
        null,
        null,
        null,
        null,
        true,
        RecommendationHistoryChangeSignificance.MAJOR,
        true
    );

    RecommendationHistoryResponseDto response = mapper.toResponse(10L, "compact", 5, List.of(entry));

    assertEquals("compact", response.view());
    assertEquals(3, response.latestVisibleChange().reasoning().size());
    assertEquals(2, response.latestVisibleChange().warnings().size());
    assertEquals(2, response.latestVisibleChange().factors().size());
    assertNull(response.latestVisibleChange().weatherContribution());
  }
}
