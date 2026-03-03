package com.example.plantbot.controller.dto.ha;

import java.util.List;

public record PlantConditionsHistoryResponse(Long plantId,
                                             int days,
                                             List<PlantConditionPointResponse> points,
                                             boolean adjustedToday,
                                             Double latestAdjustmentPercent,
                                             String latestAdjustmentReason) {
}
