package com.example.plantbot.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiRequestAnalyticsCleanupScheduler {
  private final AiRequestAnalyticsService aiRequestAnalyticsService;
  private final PerformanceMetricsService performanceMetricsService;

  private final AtomicBoolean cleanupRunning = new AtomicBoolean(false);

  @Scheduled(cron = "${app.ai-analytics.cleanup-cron:0 25 4 * * *}")
  public void cleanupOldEvents() {
    if (!cleanupRunning.compareAndSet(false, true)) {
      performanceMetricsService.incrementSchedulerOverlap("ai_request_analytics_cleanup");
      return;
    }
    long startedAt = System.nanoTime();
    try {
      long deleted = aiRequestAnalyticsService.cleanupOlderThan(Instant.now().minus(30, ChronoUnit.DAYS));
      performanceMetricsService.recordSchedulerRun("ai_request_analytics_cleanup", System.nanoTime() - startedAt, "success");
      log.info("AI request analytics cleanup completed: deleted={}", deleted);
    } catch (Exception ex) {
      performanceMetricsService.recordSchedulerRun("ai_request_analytics_cleanup", System.nanoTime() - startedAt, "error");
      log.warn("AI request analytics cleanup failed: {}", ex.getMessage());
    } finally {
      cleanupRunning.set(false);
    }
  }
}
