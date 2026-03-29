package com.example.plantbot.service.recommendation.history;

import com.example.plantbot.controller.dto.RecommendationHistoryFactorDto;
import com.example.plantbot.controller.dto.RecommendationHistoryItemDto;
import com.example.plantbot.controller.dto.RecommendationHistoryResponseDto;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryEntry;
import com.example.plantbot.service.recommendation.history.model.RecommendationHistoryFactorSummary;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RecommendationHistoryResponseMapper {

  public RecommendationHistoryResponseDto toResponse(Long plantId,
                                                     String view,
                                                     int limit,
                                                     List<RecommendationHistoryEntry> entries) {
    List<RecommendationHistoryItemDto> items = (entries == null ? List.<RecommendationHistoryEntry>of() : entries).stream()
        .map(entry -> toItem(entry, isCompact(view)))
        .toList();
    RecommendationHistoryItemDto latest = items.isEmpty() ? null : items.get(0);
    boolean hasMore = entries != null && entries.size() > limit;
    List<RecommendationHistoryItemDto> truncated = hasMore ? items.subList(0, limit) : items;
    return new RecommendationHistoryResponseDto(
        plantId,
        normalizeView(view),
        limit,
        latest,
        truncated,
        hasMore
    );
  }

  private RecommendationHistoryItemDto toItem(RecommendationHistoryEntry entry, boolean compact) {
    if (entry == null) {
      return null;
    }
    List<String> reasoning = compact ? trimList(entry.reasoning(), 3) : nullSafe(entry.reasoning());
    List<String> warnings = compact ? trimList(entry.warnings(), 2) : nullSafe(entry.warnings());
    List<RecommendationHistoryFactorDto> factors = nullSafe(entry.factors()).stream()
        .limit(compact ? 2 : 4)
        .map(this::toFactor)
        .toList();
    return new RecommendationHistoryItemDto(
        entry.id(),
        entry.plantId(),
        entry.occurredAt(),
        entry.eventType() == null ? null : entry.eventType().name(),
        entry.source() == null ? null : entry.source().name(),
        entry.currentSource() == null ? null : entry.currentSource().name(),
        entry.previousIntervalDays(),
        entry.newIntervalDays(),
        entry.previousWaterMl(),
        entry.newWaterMl(),
        entry.deltaIntervalDays(),
        entry.deltaWaterMl(),
        entry.summary(),
        reasoning,
        warnings,
        factors,
        entry.manualOverrideActive(),
        compact ? null : entry.weatherContribution(),
        compact ? null : entry.aiContribution(),
        compact ? null : entry.seasonContribution(),
        compact ? null : entry.learningContribution(),
        entry.growthStage() == null ? null : entry.growthStage().name(),
        entry.previousGrowthStage() == null ? null : entry.previousGrowthStage().name(),
        entry.seedStage() == null ? null : entry.seedStage().name(),
        entry.previousSeedStage() == null ? null : entry.previousSeedStage().name(),
        entry.meaningfulChange(),
        entry.changeSignificance() == null ? null : entry.changeSignificance().name(),
        entry.userActionRequired()
    );
  }

  private RecommendationHistoryFactorDto toFactor(RecommendationHistoryFactorSummary factor) {
    return new RecommendationHistoryFactorDto(
        factor.type(),
        factor.label(),
        factor.impactText(),
        factor.direction()
    );
  }

  private boolean isCompact(String view) {
    return !"full".equalsIgnoreCase(normalizeView(view));
  }

  private String normalizeView(String view) {
    return "full".equalsIgnoreCase(view) ? "full" : "compact";
  }

  private List<String> trimList(List<String> values, int limit) {
    return nullSafe(values).stream().limit(limit).toList();
  }

  private <T> List<T> nullSafe(List<T> values) {
    return values == null ? List.of() : values;
  }
}
