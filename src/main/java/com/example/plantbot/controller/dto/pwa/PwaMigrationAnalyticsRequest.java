package com.example.plantbot.controller.dto.pwa;

public record PwaMigrationAnalyticsRequest(
    String type,
    String source,
    String event,
    String meta,
    Long timestamp,
    String version
) {
}

