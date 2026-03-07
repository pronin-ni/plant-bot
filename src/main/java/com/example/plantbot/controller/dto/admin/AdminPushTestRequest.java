package com.example.plantbot.controller.dto.admin;

public record AdminPushTestRequest(
    Long userId,
    String title,
    String body
) {
}
