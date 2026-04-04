package com.example.plantbot.controller.dto.admin;

import com.example.plantbot.domain.AiProviderType;

public record AdminAiSettingsUpdateRequest(
    AiProviderType activeTextProvider,
    AiProviderType activeVisionProvider,
    String openrouterTextModel,
    String openrouterVisionModel,
    String openaiTextModel,
    String openaiVisionModel,
    String openaiApiKey,
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
