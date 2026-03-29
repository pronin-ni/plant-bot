package com.example.plantbot.controller.dto;

import java.util.List;

public record RecommendationHistoryResponseDto(
    Long plantId,
    String view,
    Integer limit,
    RecommendationHistoryItemDto latestVisibleChange,
    List<RecommendationHistoryItemDto> items,
    boolean hasMore
) {
}
