package com.example.plantbot.controller.dto.admin;

import com.example.plantbot.domain.AiProviderType;

public record AdminAiSettingsUpdateRequest(
    AiProviderType activeTextProvider,
    AiProviderType activeVisionProvider,
    String openrouterTextModel,
    String openrouterVisionModel,
    String openaiCompatibleBaseUrl,
    String openaiCompatibleModelsUrl,
    String openaiCompatibleTextModel,
    String openaiCompatibleVisionModel,
    String openaiCompatibleApiKey,
    Integer openaiCompatibleRequestTimeoutMs,
    Integer openaiCompatibleMaxTokens,
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
