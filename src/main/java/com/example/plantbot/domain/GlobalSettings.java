package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "global_settings")
@Getter
@Setter
@NoArgsConstructor
public class GlobalSettings {
  @Id
  private Long id = 1L;

  // Значение хранится в зашифрованном виде (префикс enc::).
  @Column(name = "openrouter_api_key")
  private String openrouterApiKey;

  @Column(name = "openai_api_key")
  private String openaiApiKey;

  @Enumerated(EnumType.STRING)
  @Column(name = "active_text_provider", length = 32)
  private AiProviderType activeTextProvider = AiProviderType.OPENROUTER;

  @Enumerated(EnumType.STRING)
  @Column(name = "active_vision_provider", length = 32)
  private AiProviderType activeVisionProvider = AiProviderType.OPENROUTER;

  @Column(name = "chat_model")
  private String chatModel;

  // Упрощённая глобальная модель для всех текстовых OpenRouter-запросов.
  @Column(name = "openrouter_text_model")
  private String openrouterTextModel;

  @Column(name = "photo_recognition_model")
  private String photoRecognitionModel;

  // Упрощённая глобальная модель для всех photo/vision OpenRouter-запросов.
  @Column(name = "openrouter_photo_model")
  private String openrouterPhotoModel;

  @Column(name = "openai_text_model")
  private String openaiTextModel;

  @Column(name = "openai_vision_model")
  private String openaiVisionModel;

  @Column(name = "photo_diagnosis_model")
  private String photoDiagnosisModel;

  @Enumerated(EnumType.STRING)
  @Column(name = "text_model_availability_status")
  private OpenRouterModelAvailabilityStatus textModelAvailabilityStatus = OpenRouterModelAvailabilityStatus.UNKNOWN;

  @Column(name = "text_model_last_checked_at")
  private Instant textModelLastCheckedAt;

  @Column(name = "text_model_last_successful_at")
  private Instant textModelLastSuccessfulAt;

  @Column(name = "text_model_last_error_message", length = 1024)
  private String textModelLastErrorMessage;

  @Column(name = "text_model_last_notified_unavailable_at")
  private Instant textModelLastNotifiedUnavailableAt;

  @Enumerated(EnumType.STRING)
  @Column(name = "photo_model_availability_status")
  private OpenRouterModelAvailabilityStatus photoModelAvailabilityStatus = OpenRouterModelAvailabilityStatus.UNKNOWN;

  @Column(name = "photo_model_last_checked_at")
  private Instant photoModelLastCheckedAt;

  @Column(name = "photo_model_last_successful_at")
  private Instant photoModelLastSuccessfulAt;

  @Column(name = "photo_model_last_error_message", length = 1024)
  private String photoModelLastErrorMessage;

  @Column(name = "photo_model_last_notified_unavailable_at")
  private Instant photoModelLastNotifiedUnavailableAt;

  @Column(name = "text_model_check_interval_minutes")
  private Integer textModelCheckIntervalMinutes;

  @Column(name = "photo_model_check_interval_minutes")
  private Integer photoModelCheckIntervalMinutes;

  @Column(name = "openrouter_health_checks_enabled")
  private Boolean openrouterHealthChecksEnabled = true;

  @Column(name = "openrouter_retry_count")
  private Integer openrouterRetryCount;

  @Column(name = "openrouter_retry_base_delay_ms")
  private Integer openrouterRetryBaseDelayMs;

  @Column(name = "openrouter_retry_max_delay_ms")
  private Integer openrouterRetryMaxDelayMs;

  @Column(name = "openrouter_request_timeout_ms")
  private Integer openrouterRequestTimeoutMs;

  @Column(name = "openrouter_degraded_failure_threshold")
  private Integer openrouterDegradedFailureThreshold;

  @Column(name = "openrouter_unavailable_failure_threshold")
  private Integer openrouterUnavailableFailureThreshold;

  @Column(name = "openrouter_unavailable_cooldown_minutes")
  private Integer openrouterUnavailableCooldownMinutes;

  @Column(name = "openrouter_recovery_recheck_interval_minutes")
  private Integer openrouterRecoveryRecheckIntervalMinutes;

  @Column(name = "ai_text_cache_enabled", nullable = false)
  private boolean aiTextCacheEnabled = true;

  @Column(name = "ai_text_cache_ttl_days")
  private Integer aiTextCacheTtlDays;

  @Column(name = "ai_text_cache_last_cleanup_at")
  private Instant aiTextCacheLastCleanupAt;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @PrePersist
  void onCreate() {
    Instant now = Instant.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = Instant.now();
  }
}
