package com.example.plantbot.controller.dto.admin;

public record AdminOpenRouterModelsUpdateRequest(
    String textModel,
    String photoModel,
    Integer textModelCheckIntervalMinutes,
    Integer photoModelCheckIntervalMinutes,
    Boolean healthChecksEnabled,
    Integer retryCount,
    Integer retryBaseDelayMs,
    Integer retryMaxDelayMs,
    Integer requestTimeoutMs,
    Integer degradedFailureThreshold,
    Integer unavailableFailureThreshold,
    Integer unavailableCooldownMinutes,
    Integer recoveryRecheckIntervalMinutes,
    Boolean aiTextCacheEnabled,
    Integer aiTextCacheTtlDays
) {
}
