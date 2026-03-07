package com.example.plantbot.controller.dto.pwa;

public record PwaPushSubscribeResponse(
    boolean ok,
    int subscriptionsCount
) {
}

