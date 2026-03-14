package com.example.plantbot.controller.dto.pwa;

public record PwaPushTestRequest(
    String endpoint,
    String title,
    String body,
    String tag
) {
}
