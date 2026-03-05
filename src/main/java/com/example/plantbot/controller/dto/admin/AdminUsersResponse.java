package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminUsersResponse(
    List<AdminUserItemResponse> items,
    int page,
    int size,
    long total
) {
}
