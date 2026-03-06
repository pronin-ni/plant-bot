package com.example.plantbot.controller.dto;

import java.time.Instant;

public record AssistantChatHistoryItemResponse(
    Long id,
    String question,
    String answer,
    String model,
    Instant createdAt
) {
}
