package com.example.plantbot.controller.dto.pwa;

import com.fasterxml.jackson.annotation.JsonProperty;

public record PwaPushSubscriptionRequest(
    String endpoint,
    Keys keys,
    @JsonProperty("userAgent") String userAgent
) {
  public record Keys(String p256dh, String auth) {
  }
}

