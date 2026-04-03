package com.example.plantbot.controller.dto.admin;

import java.time.Instant;

public record AdminOpenRouterModelsResponse(
    String textModel,
    String photoModel,
    boolean hasApiKey,
    boolean healthChecksEnabled,
    Integer retryCount,
    Integer retryBaseDelayMs,
    Integer retryMaxDelayMs,
    Integer requestTimeoutMs,
    Integer degradedFailureThreshold,
    Integer unavailableFailureThreshold,
    Integer unavailableCooldownMinutes,
    Integer recoveryRecheckIntervalMinutes,
    boolean aiTextCacheEnabled,
    Integer aiTextCacheTtlDays,
    long aiTextCacheEntryCount,
    Instant aiTextCacheLastCleanupAt,
    Instant updatedAt,
    String textModelAvailabilityStatus,
    Instant textModelLastCheckedAt,
    Instant textModelLastSuccessfulAt,
    String textModelLastErrorMessage,
    Instant textModelLastNotifiedUnavailableAt,
    Integer textModelCheckIntervalMinutes,
    String photoModelAvailabilityStatus,
    Instant photoModelLastCheckedAt,
    Instant photoModelLastSuccessfulAt,
    String photoModelLastErrorMessage,
    Instant photoModelLastNotifiedUnavailableAt,
    Integer photoModelCheckIntervalMinutes
) {
}
