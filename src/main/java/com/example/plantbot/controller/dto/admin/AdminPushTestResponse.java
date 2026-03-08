package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminPushTestResponse(
    boolean ok,
    Long userId,
    String username,
    int subscriptions,
    int delivered,
    String message,
    List<AdminPushEndpointResultResponse> endpoints
) {
  public record AdminPushEndpointResultResponse(
      String endpoint,
      boolean delivered,
      int status,
      String error
  ) {
  }
}
