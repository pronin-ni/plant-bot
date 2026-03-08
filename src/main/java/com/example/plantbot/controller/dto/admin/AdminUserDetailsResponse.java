package com.example.plantbot.controller.dto.admin;

import java.time.Instant;
import java.util.List;

public record AdminUserDetailsResponse(
    Long id,
    Long telegramId,
    String username,
    String firstName,
    String lastName,
    String email,
    String city,
    Boolean blocked,
    Instant createdAt,
    Instant lastSeenAt,
    Instant lastSeenPwaAt,
    Instant lastSeenTmaAt,
    long plantCount,
    long overduePlants,
    long totalWaterings,
    boolean homeAssistantConnected,
    String homeAssistantInstanceName,
    String homeAssistantBaseUrlMasked,
    Instant homeAssistantLastSuccessAt,
    boolean hasOpenRouterKey,
    String openrouterModelPlant,
    String openrouterModelChat,
    String openrouterModelPhotoIdentify,
    String openrouterModelPhotoDiagnose,
    List<AdminPlantItemResponse> plants
) {
}
