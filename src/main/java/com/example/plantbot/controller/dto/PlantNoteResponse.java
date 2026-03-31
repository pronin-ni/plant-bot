package com.example.plantbot.controller.dto;

import java.time.Instant;

public record PlantNoteResponse(
    String id,
    String type,
    String title,
    String amount,
    String text,
    Instant createdAt
) {}
