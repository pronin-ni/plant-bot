package com.example.plantbot.service;

import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;

import java.time.Instant;

public record AiAnalyticsAggregationRow(
    AiRequestKind requestKind,
    AiProviderType provider,
    String model,
    long total,
    long success,
    long failed,
    Instant lastSuccessAt,
    Instant lastFailureAt
) {
}
