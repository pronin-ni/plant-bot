package com.example.plantbot.config;

import com.example.plantbot.service.PerformanceMetricsService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
@Order(Ordered.HIGHEST_PRECEDENCE + 50)
@Slf4j
public class ApiRequestMetricsFilter extends OncePerRequestFilter {
  private static final Pattern ID_SEGMENT = Pattern.compile("/\\d+");

  private final PerformanceMetricsService performanceMetricsService;

  @Value("${app.observability.slow-request-ms:800}")
  private long slowRequestMs;

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    long startedAt = System.nanoTime();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationNanos = System.nanoTime() - startedAt;
      String path = normalizePath(request.getRequestURI());
      performanceMetricsService.recordHttpRequest(request.getMethod(), path, response.getStatus(), durationNanos);
      long durationMs = durationNanos / 1_000_000;
      if (path.startsWith("/api") && durationMs >= Math.max(1, slowRequestMs)) {
        log.warn("Slow request detected: method={} path={} status={} durationMs={}",
            request.getMethod(), path, response.getStatus(), durationMs);
      }
    }
  }

  private String normalizePath(String rawPath) {
    if (rawPath == null || rawPath.isBlank()) {
      return "/";
    }
    return ID_SEGMENT.matcher(rawPath.trim()).replaceAll("/{id}");
  }
}
