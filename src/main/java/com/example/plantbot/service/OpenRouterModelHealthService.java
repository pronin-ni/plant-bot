package com.example.plantbot.service;

import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.domain.OpenRouterModelAvailabilityStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterModelHealthService {
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelAvailabilityPersistenceService persistenceService;

  private final Map<String, AtomicInteger> failureCounters = new ConcurrentHashMap<>();

  public boolean shouldAllowRequest(OpenRouterModelKind kind, String modelName) {
    if (!isTrackedCurrentModel(kind, modelName)) {
      return true;
    }
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    OpenRouterModelAvailabilityStatus status = currentStatus(settings, kind);
    if (status != OpenRouterModelAvailabilityStatus.UNAVAILABLE) {
      return true;
    }
    Instant checkedAt = lastCheckedAt(settings, kind);
    int recoveryMinutes = openRouterGlobalSettingsService.resolveRecoveryRecheckIntervalMinutes();
    return checkedAt == null || checkedAt.plus(Duration.ofMinutes(Math.max(1, recoveryMinutes))).isBefore(Instant.now());
  }

  public void recordSuccess(OpenRouterModelKind kind, String modelName) {
    if (!isTrackedCurrentModel(kind, modelName)) {
      return;
    }
    failureCounters.remove(counterKey(kind, modelName));
    persistenceService.markSuccess(kind, Instant.now());
  }

  public void recordFailure(OpenRouterModelKind kind, String modelName, OpenRouterFailureType failureType, String message) {
    if (!isTrackedCurrentModel(kind, modelName)) {
      return;
    }
    Instant now = Instant.now();
    if (failureType == OpenRouterFailureType.INVALID_KEY || failureType == OpenRouterFailureType.MODEL_UNAVAILABLE) {
      failureCounters.remove(counterKey(kind, modelName));
      persistenceService.markStatus(kind, OpenRouterModelAvailabilityStatus.UNAVAILABLE, sanitize(message), now, false);
      return;
    }

    AtomicInteger counter = failureCounters.computeIfAbsent(counterKey(kind, modelName), ignored -> new AtomicInteger());
    int failures = counter.incrementAndGet();
    int unavailableThreshold = openRouterGlobalSettingsService.resolveUnavailableFailureThreshold();
    int degradedThreshold = openRouterGlobalSettingsService.resolveDegradedFailureThreshold();

    if (failures >= unavailableThreshold) {
      persistenceService.markStatus(kind, OpenRouterModelAvailabilityStatus.UNAVAILABLE, sanitize(message), now, false);
      return;
    }
    if (failures >= degradedThreshold) {
      persistenceService.markStatus(kind, OpenRouterModelAvailabilityStatus.DEGRADED, sanitize(message), now, false);
    }
  }

  private boolean isTrackedCurrentModel(OpenRouterModelKind kind, String modelName) {
    if (modelName == null || modelName.isBlank()) {
      return false;
    }
    GlobalSettings settings = openRouterGlobalSettingsService.getOrCreate();
    OpenRouterGlobalSettingsService.ResolvedModels models = openRouterGlobalSettingsService.resolveModels(settings);
    String normalized = modelName.trim();
    if (kind == OpenRouterModelKind.PHOTO) {
      return equalsIgnoreCase(normalized, models.photoRecognitionModel())
          || equalsIgnoreCase(normalized, models.photoDiagnosisModel());
    }
    return equalsIgnoreCase(normalized, models.chatModel());
  }

  private boolean equalsIgnoreCase(String left, String right) {
    return left != null && right != null && left.equalsIgnoreCase(right);
  }

  private OpenRouterModelAvailabilityStatus currentStatus(GlobalSettings settings, OpenRouterModelKind kind) {
    return kind == OpenRouterModelKind.PHOTO
        ? safeStatus(settings.getPhotoModelAvailabilityStatus())
        : safeStatus(settings.getTextModelAvailabilityStatus());
  }

  private Instant lastCheckedAt(GlobalSettings settings, OpenRouterModelKind kind) {
    return kind == OpenRouterModelKind.PHOTO ? settings.getPhotoModelLastCheckedAt() : settings.getTextModelLastCheckedAt();
  }

  private OpenRouterModelAvailabilityStatus safeStatus(OpenRouterModelAvailabilityStatus status) {
    return status == null ? OpenRouterModelAvailabilityStatus.UNKNOWN : status;
  }

  private String counterKey(OpenRouterModelKind kind, String modelName) {
    return kind.name() + ":" + modelName.trim().toLowerCase();
  }

  private String sanitize(String message) {
    if (message == null || message.isBlank()) {
      return "OpenRouter временно недоступен";
    }
    String normalized = message.trim();
    return normalized.length() > 1024 ? normalized.substring(0, 1024) : normalized;
  }
}
