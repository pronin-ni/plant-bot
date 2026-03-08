package com.example.plantbot.controller.dto.admin;

public record AdminScopedCacheClearResponse(
    String scope,
    int weatherEntries,
    int weatherRainKeys,
    int weatherRainSamples,
    int openRouterCareEntries,
    int openRouterWateringEntries,
    int openRouterChatEntries,
    int userCacheEntries,
    String message
) {
}
