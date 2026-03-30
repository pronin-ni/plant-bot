package com.example.plantbot.controller.dto;

import java.time.Instant;

public record GrowthEntryResponse(
    Long id,
    Long plantId,
    String imageUrl,
    Instant createdAt,
    String note,
    String source,
    String aiSummary,
    String metadataJson
) {}
