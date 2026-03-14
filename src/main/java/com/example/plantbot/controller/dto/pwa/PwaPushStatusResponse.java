package com.example.plantbot.controller.dto.pwa;

public record PwaPushStatusResponse(
    boolean enabled,
    boolean subscribed,
    boolean userSubscribed,
    boolean currentDeviceSubscribed,
    int subscriptionsCount
) {
}
