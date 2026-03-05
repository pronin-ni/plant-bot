package com.example.plantbot.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AdminRateLimitInterceptor implements HandlerInterceptor {
  private final Map<String, Deque<Long>> requestTimesByKey = new ConcurrentHashMap<>();
  private final int maxRequests;
  private final long windowMs;

  public AdminRateLimitInterceptor(
      @Value("${app.admin.rate-limit.max-requests:120}") int maxRequests,
      @Value("${app.admin.rate-limit.window-seconds:60}") long windowSeconds
  ) {
    this.maxRequests = Math.max(10, maxRequests);
    this.windowMs = Math.max(10, windowSeconds) * 1000L;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
    String key = request.getRemoteAddr();
    long now = System.currentTimeMillis();
    Deque<Long> deque = requestTimesByKey.computeIfAbsent(key, k -> new ArrayDeque<>());
    synchronized (deque) {
      while (!deque.isEmpty() && now - deque.peekFirst() > windowMs) {
        deque.pollFirst();
      }
      if (deque.size() >= maxRequests) {
        response.setStatus(429);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"message\":\"Слишком много запросов к admin API. Повторите позже.\"}");
        return false;
      }
      deque.addLast(now);
    }
    return true;
  }
}
