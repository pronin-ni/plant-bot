package com.example.plantbot.controller.dto.pwa;

import java.util.List;

public record PwaPushTestResponse(
    boolean acceptedByProvider,
    int subscriptions,
    int accepted,
    String message,
    String tag,
    List<PwaPushTestEndpointResponse> endpoints
) {
  public record PwaPushTestEndpointResponse(
      String endpoint,
      boolean accepted,
      int status,
      String error
  ) {
  }
}
