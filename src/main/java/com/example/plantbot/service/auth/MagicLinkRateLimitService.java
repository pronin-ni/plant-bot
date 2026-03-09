package com.example.plantbot.service.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MagicLinkRateLimitService {
  private final Map<String, Deque<Long>> requestIpWindows = new ConcurrentHashMap<>();
  private final Map<String, Deque<Long>> requestEmailWindows = new ConcurrentHashMap<>();
  private final Map<String, Deque<Long>> verifyIpWindows = new ConcurrentHashMap<>();

  private final int requestMax;
  private final long requestWindowMs;
  private final int verifyIpMax;
  private final long verifyWindowMs;

  public MagicLinkRateLimitService(
      @Value("${app.magic-link.rate-limit.max-requests:5}") int requestMax,
      @Value("${app.magic-link.rate-limit.window-seconds:60}") long requestWindowSeconds,
      @Value("${app.magic-link.verify-rate-limit.max-requests:20}") int verifyIpMax,
      @Value("${app.magic-link.verify-rate-limit.window-seconds:60}") long verifyWindowSeconds
  ) {
    this.requestMax = Math.max(1, requestMax);
    this.requestWindowMs = Math.max(1, requestWindowSeconds) * 1000L;
    this.verifyIpMax = Math.max(1, verifyIpMax);
    this.verifyWindowMs = Math.max(1, verifyWindowSeconds) * 1000L;
  }

  public void checkRequestAllowed(String ipAddress, String email) {
    limit(requestIpWindows, "ip:" + safe(ipAddress), requestMax, requestWindowMs, "Слишком много запросов с этого IP. Повторите через минуту.");
    limit(requestEmailWindows, "email:" + safe(email), requestMax, requestWindowMs, "Слишком много запросов для этого email. Повторите через минуту.");
  }

  public void checkVerifyAllowed(String ipAddress) {
    limit(verifyIpWindows, "verify-ip:" + safe(ipAddress), verifyIpMax, verifyWindowMs, "Слишком много попыток подтверждения. Повторите позже.");
  }

  private void limit(
      Map<String, Deque<Long>> storage,
      String key,
      int maxRequests,
      long windowMs,
      String message
  ) {
    long now = System.currentTimeMillis();
    Deque<Long> window = storage.computeIfAbsent(key, __ -> new ArrayDeque<>());
    synchronized (window) {
      while (!window.isEmpty() && now - window.peekFirst() > windowMs) {
        window.pollFirst();
      }
      if (window.size() >= maxRequests) {
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
      }
      window.addLast(now);
    }
  }

  private String safe(String value) {
    if (value == null || value.isBlank()) {
      return "unknown";
    }
    return value.trim();
  }
}
