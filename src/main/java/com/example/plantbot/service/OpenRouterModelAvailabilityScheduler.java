package com.example.plantbot.service;

import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.domain.OpenRouterModelAvailabilityStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterModelAvailabilityScheduler {
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelAvailabilityCheckService checkService;
  private final OpenRouterModelAvailabilityPersistenceService persistenceService;
  private final AdminNotificationService adminNotificationService;
  private final PerformanceMetricsService performanceMetricsService;

  private final AtomicBoolean textCheckRunning = new AtomicBoolean(false);
  private final AtomicBoolean photoCheckRunning = new AtomicBoolean(false);

  @Value("${openrouter.availability.notification-cooldown-minutes:360}")
  private int notificationCooldownMinutes;

  @Scheduled(fixedDelayString = "${openrouter.availability.scheduler-delay-ms:60000}")
  public void pollAvailability() {
    long startedAt = System.nanoTime();
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    try {
      maybeCheckTextModel(settings);
      maybeCheckPhotoModel(settings);
      performanceMetricsService.recordSchedulerRun("openrouter_model_availability", System.nanoTime() - startedAt, "success");
    } catch (Exception ex) {
      performanceMetricsService.recordSchedulerRun("openrouter_model_availability", System.nanoTime() - startedAt, "error");
      throw ex;
    }
  }

  private void maybeCheckTextModel(GlobalSettings settings) {
    Integer intervalMinutes = settings.getTextModelCheckIntervalMinutes();
    if (!isCheckDue(intervalMinutes, settings.getTextModelLastCheckedAt())) {
      return;
    }
    if (!textCheckRunning.compareAndSet(false, true)) {
      performanceMetricsService.incrementSchedulerOverlap("openrouter_text_model_check");
      return;
    }
    try {
      OpenRouterModelAvailabilityStatus previousStatus = settings.getTextModelAvailabilityStatus();
      var result = checkService.checkCurrentTextModel();
      GlobalSettings updated = persistenceService.saveTextCheck(result);
      maybeNotifyTextModel(previousStatus, updated, result);
      log.info("OpenRouter text model availability checked: model='{}' status={} failureType={}",
          result.model(), result.status(), result.failureType());
    } finally {
      textCheckRunning.set(false);
    }
  }

  private void maybeCheckPhotoModel(GlobalSettings settings) {
    Integer intervalMinutes = settings.getPhotoModelCheckIntervalMinutes();
    if (!isCheckDue(intervalMinutes, settings.getPhotoModelLastCheckedAt())) {
      return;
    }
    if (!photoCheckRunning.compareAndSet(false, true)) {
      performanceMetricsService.incrementSchedulerOverlap("openrouter_photo_model_check");
      return;
    }
    try {
      OpenRouterModelAvailabilityStatus previousStatus = settings.getPhotoModelAvailabilityStatus();
      var result = checkService.checkCurrentVisionModel();
      GlobalSettings updated = persistenceService.savePhotoCheck(result);
      maybeNotifyPhotoModel(previousStatus, updated, result);
      log.info("OpenRouter photo model availability checked: model='{}' status={} failureType={}",
          result.model(), result.status(), result.failureType());
    } finally {
      photoCheckRunning.set(false);
    }
  }

  private boolean isCheckDue(Integer intervalMinutes, Instant lastCheckedAt) {
    if (intervalMinutes == null) {
      intervalMinutes = 15;
    }
    if (intervalMinutes <= 0) {
      return false;
    }
    if (lastCheckedAt == null) {
      return true;
    }
    return lastCheckedAt.plus(Duration.ofMinutes(intervalMinutes)).isBefore(Instant.now());
  }

  private void maybeNotifyTextModel(OpenRouterModelAvailabilityStatus previousStatus,
                                    GlobalSettings settings,
                                    OpenRouterModelAvailabilityCheckService.ModelCheckResult result) {
    if (isUnavailable(result.status())) {
      if (shouldNotify(settings.getTextModelLastNotifiedUnavailableAt(), previousStatus, result.status())) {
        adminNotificationService.notifyAdmin(
            "OpenRouter text model недоступна",
            "Текстовая модель `" + safeModel(result.model()) + "` недоступна. "
                + "Проверьте настройки OpenRouter и при необходимости смените модель. "
                + "Причина: " + safeMessage(result.message())
        );
        persistenceService.markTextUnavailableNotified();
      }
      return;
    }

    if (result.status() == OpenRouterModelAvailabilityStatus.AVAILABLE && isUnavailable(previousStatus)) {
      adminNotificationService.notifyAdmin(
          "OpenRouter text model восстановлена",
          "Текстовая модель `" + safeModel(result.model()) + "` снова доступна."
      );
    }
  }

  private void maybeNotifyPhotoModel(OpenRouterModelAvailabilityStatus previousStatus,
                                     GlobalSettings settings,
                                     OpenRouterModelAvailabilityCheckService.ModelCheckResult result) {
    if (isUnavailable(result.status())) {
      if (shouldNotify(settings.getPhotoModelLastNotifiedUnavailableAt(), previousStatus, result.status())) {
        adminNotificationService.notifyAdmin(
            "OpenRouter vision model недоступна",
            "Vision модель `" + safeModel(result.model()) + "` недоступна. "
                + "Проверьте настройки OpenRouter и при необходимости смените модель. "
                + "Причина: " + safeMessage(result.message())
        );
        persistenceService.markPhotoUnavailableNotified();
      }
      return;
    }

    if (result.status() == OpenRouterModelAvailabilityStatus.AVAILABLE && isUnavailable(previousStatus)) {
      adminNotificationService.notifyAdmin(
          "OpenRouter vision model восстановлена",
          "Vision модель `" + safeModel(result.model()) + "` снова доступна."
      );
    }
  }

  private boolean shouldNotify(Instant lastNotifiedAt,
                               OpenRouterModelAvailabilityStatus previousStatus,
                               OpenRouterModelAvailabilityStatus currentStatus) {
    if (!isUnavailable(currentStatus)) {
      return false;
    }
    if (!isUnavailable(previousStatus)) {
      return true;
    }
    if (lastNotifiedAt == null) {
      return true;
    }
    int cooldown = Math.max(1, notificationCooldownMinutes);
    return lastNotifiedAt.plus(Duration.ofMinutes(cooldown)).isBefore(Instant.now());
  }

  private boolean isUnavailable(OpenRouterModelAvailabilityStatus status) {
    return status == OpenRouterModelAvailabilityStatus.UNAVAILABLE
        || status == OpenRouterModelAvailabilityStatus.ERROR;
  }

  private String safeModel(String model) {
    return model == null || model.isBlank() ? "не выбрана" : model.trim();
  }

  private String safeMessage(String message) {
    return message == null || message.isBlank() ? "причина не указана" : message.trim();
  }
}
