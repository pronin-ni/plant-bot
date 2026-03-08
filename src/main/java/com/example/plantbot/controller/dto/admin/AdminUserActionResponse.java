package com.example.plantbot.controller.dto.admin;

public record AdminUserActionResponse(
    boolean ok,
    Long userId,
    String message
) {
}
