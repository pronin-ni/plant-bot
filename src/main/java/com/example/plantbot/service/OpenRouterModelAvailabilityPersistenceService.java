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
    settings.setTextModelAvailabilityStatus(result.status());
    settings.setTextModelLastCheckedAt(result.checkedAt());
    if (result.status() == OpenRouterModelAvailabilityStatus.AVAILABLE) {
      settings.setTextModelLastSuccessfulAt(result.successfulAt() == null ? result.checkedAt() : result.successfulAt());
      settings.setTextModelLastErrorMessage(null);
    } else {
      settings.setTextModelLastErrorMessage(result.message());
    }
    return globalSettingsRepository.save(settings);
  }

  @Transactional
  public GlobalSettings savePhotoCheck(OpenRouterModelAvailabilityCheckService.ModelCheckResult result) {
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    settings.setPhotoModelAvailabilityStatus(result.status());
    settings.setPhotoModelLastCheckedAt(result.checkedAt());
    if (result.status() == OpenRouterModelAvailabilityStatus.AVAILABLE) {
      settings.setPhotoModelLastSuccessfulAt(result.successfulAt() == null ? result.checkedAt() : result.successfulAt());
      settings.setPhotoModelLastErrorMessage(null);
    } else {
      settings.setPhotoModelLastErrorMessage(result.message());
    }
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
}
