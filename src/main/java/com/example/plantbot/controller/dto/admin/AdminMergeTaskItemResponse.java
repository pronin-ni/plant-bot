package com.example.plantbot.controller.dto.admin;

import com.example.plantbot.domain.DictionaryMergeStatus;
import com.example.plantbot.domain.PlantCategory;

import java.time.Instant;

public record AdminMergeTaskItemResponse(
    Long id,
    PlantCategory category,
    String leftName,
    String rightName,
    DictionaryMergeStatus status,
    Integer attemptCount,
    Instant nextAttemptAt,
    String lastError,
    Instant updatedAt
) {
}

