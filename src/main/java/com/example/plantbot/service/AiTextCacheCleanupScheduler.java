package com.example.plantbot.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiTextCacheCleanupScheduler {
  private final AiTextCacheService aiTextCacheService;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final PerformanceMetricsService performanceMetricsService;

  private final AtomicBoolean cleanupRunning = new AtomicBoolean(false);

  @Scheduled(cron = "${openrouter.ai-text-cache.cleanup-cron:0 */30 * * * *}")
  public void cleanupExpiredEntries() {
    if (!cleanupRunning.compareAndSet(false, true)) {
      performanceMetricsService.incrementSchedulerOverlap("ai_text_cache_cleanup");
      return;
    }

    long startedAt = System.nanoTime();
    try {
      int deleted = aiTextCacheService.cleanupExpiredOrInvalidated();
      openRouterGlobalSettingsService.markAiTextCacheCleanupAt(Instant.now());
      performanceMetricsService.recordSchedulerRun("ai_text_cache_cleanup", System.nanoTime() - startedAt, "success");
      log.info("AI text cache cleanup completed: deleted={}", deleted);
    } catch (Exception ex) {
      performanceMetricsService.recordSchedulerRun("ai_text_cache_cleanup", System.nanoTime() - startedAt, "error");
      log.warn("AI text cache cleanup failed: {}", ex.getMessage());
    } finally {
      cleanupRunning.set(false);
    }
  }
}
