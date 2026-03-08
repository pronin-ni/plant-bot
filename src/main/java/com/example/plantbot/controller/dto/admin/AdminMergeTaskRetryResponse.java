package com.example.plantbot.controller.dto.admin;

public record AdminMergeTaskRetryResponse(
    boolean ok,
    Long taskId,
    String message
) {
}

