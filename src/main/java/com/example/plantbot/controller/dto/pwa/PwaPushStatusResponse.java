package com.example.plantbot.controller.dto.pwa;

public record PwaPushStatusResponse(
    boolean enabled,
    boolean subscribed,
    int subscriptionsCount
) {
}

