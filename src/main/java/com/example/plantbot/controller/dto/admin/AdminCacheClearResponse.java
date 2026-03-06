package com.example.plantbot.controller.dto.admin;

public record AdminCacheClearResponse(
    int plantLookupRows,
    int openRouterCareEntries,
    int openRouterWateringEntries,
    int openRouterChatEntries,
    int weatherEntries,
    int weatherRainKeys,
    int weatherRainSamples
) {
}
