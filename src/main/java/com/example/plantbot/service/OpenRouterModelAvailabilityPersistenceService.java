package com.example.plantbot.service;

import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.domain.OpenRouterModelAvailabilityStatus;
import com.example.plantbot.repository.GlobalSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OpenRouterModelAvailabilityPersistenceService {
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final GlobalSettingsRepository globalSettingsRepository;

  @Transactional
  public GlobalSettings saveTextCheck(OpenRouterModelAvailabilityCheckService.ModelCheckResult result) {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    applyStatus(settings, OpenRouterModelKind.TEXT, result.status(), result.message(), result.checkedAt(), result.successfulAt());
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings savePhotoCheck(OpenRouterModelAvailabilityCheckService.ModelCheckResult result) {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    applyStatus(settings, OpenRouterModelKind.PHOTO, result.status(), result.message(), result.checkedAt(), result.successfulAt());
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings markStatus(OpenRouterModelKind kind,
                                   OpenRouterModelAvailabilityStatus status,
                                   String message,
                                   java.time.Instant checkedAt,
                                   boolean successful) {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    applyStatus(settings, kind, status, message, checkedAt, successful ? checkedAt : null);
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings markSuccess(OpenRouterModelKind kind, java.time.Instant successfulAt) {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    applyStatus(settings, kind, OpenRouterModelAvailabilityStatus.AVAILABLE, null, successfulAt, successfulAt);
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings markTextUnavailableNotified() {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    settings.setTextModelLastNotifiedUnavailableAt(java.time.Instant.now());
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings markPhotoUnavailableNotified() {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    settings.setPhotoModelLastNotifiedUnavailableAt(java.time.Instant.now());
    return globalSettingsRepository.save(settings);
  }

  private void applyStatus(GlobalSettings settings,
                           OpenRouterModelKind kind,
                           OpenRouterModelAvailabilityStatus status,
                           String message,
                           java.time.Instant checkedAt,
                           java.time.Instant successfulAt) {
    OpenRouterModelAvailabilityStatus normalized = status == null ? OpenRouterModelAvailabilityStatus.UNKNOWN : status;
    java.time.Instant checked = checkedAt == null ? java.time.Instant.now() : checkedAt;
    if (kind == OpenRouterModelKind.PHOTO) {
      settings.setPhotoModelAvailabilityStatus(normalized);
      settings.setPhotoModelLastCheckedAt(checked);
      if (normalized == OpenRouterModelAvailabilityStatus.AVAILABLE) {
        settings.setPhotoModelLastSuccessfulAt(successfulAt == null ? checked : successfulAt);
        settings.setPhotoModelLastErrorMessage(null);
      } else {
        settings.setPhotoModelLastErrorMessage(truncate(message));
      }
      return;
    }
    settings.setTextModelAvailabilityStatus(normalized);
    settings.setTextModelLastCheckedAt(checked);
    if (normalized == OpenRouterModelAvailabilityStatus.AVAILABLE) {
      settings.setTextModelLastSuccessfulAt(successfulAt == null ? checked : successfulAt);
      settings.setTextModelLastErrorMessage(null);
    } else {
      settings.setTextModelLastErrorMessage(truncate(message));
    }
  }

  private String truncate(String message) {
    if (message == null || message.isBlank()) {
      return null;
    }
    String normalized = message.trim();
    return normalized.length() > 1024 ? normalized.substring(0, 1024) : normalized;
  }
}
