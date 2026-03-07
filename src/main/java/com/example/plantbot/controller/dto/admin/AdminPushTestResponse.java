package com.example.plantbot.controller.dto.admin;

public record AdminPushTestResponse(
    boolean ok,
    Long userId,
    String username,
    int subscriptions,
    int delivered,
    String message
) {
}
