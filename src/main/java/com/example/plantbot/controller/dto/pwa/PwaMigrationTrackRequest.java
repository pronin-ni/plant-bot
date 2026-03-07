package com.example.plantbot.controller.dto.pwa;

public record PwaMigrationTrackRequest(
    String source,
    String event,
    String meta
) {
}

