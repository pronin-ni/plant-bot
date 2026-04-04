package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOpenRouterModelsUpdateRequest;
import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.repository.AiTextCacheEntryRepository;
import com.example.plantbot.repository.GlobalSettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterGlobalSettingsService {
  private static final long SINGLETON_ID = 1L;
  private static final String ENC_PREFIX = "enc::";
  private static final int DEFAULT_AI_TEXT_CACHE_TTL_DAYS = 7;
  private static final int MIN_AI_TEXT_CACHE_TTL_DAYS = 1;
  private static final int MAX_AI_TEXT_CACHE_TTL_DAYS = 30;
  private static final int DEFAULT_OPENROUTER_RETRY_COUNT = 2;
  private static final int DEFAULT_OPENROUTER_RETRY_BASE_DELAY_MS = 600;
  private static final int DEFAULT_OPENROUTER_RETRY_MAX_DELAY_MS = 4000;
  private static final int DEFAULT_OPENROUTER_REQUEST_TIMEOUT_MS = 15000;
  private static final int DEFAULT_OPENROUTER_DEGRADED_FAILURE_THRESHOLD = 2;
  private static final int DEFAULT_OPENROUTER_UNAVAILABLE_FAILURE_THRESHOLD = 4;
  private static final int DEFAULT_OPENROUTER_UNAVAILABLE_COOLDOWN_MINUTES = 15;
  private static final int DEFAULT_OPENROUTER_RECOVERY_RECHECK_INTERVAL_MINUTES = 5;

  private final GlobalSettingsRepository globalSettingsRepository;
  private final AiTextCacheEntryRepository aiTextCacheEntryRepository;
  private final OpenRouterApiKeyCryptoService cryptoService;

  @Value("${openrouter.resilience.retry-count:2}")
  private int defaultRetryCount;

  @Value("${openrouter.resilience.retry-base-delay-ms:600}")
  private int defaultRetryBaseDelayMs;

  @Value("${openrouter.resilience.retry-max-delay-ms:4000}")
  private int defaultRetryMaxDelayMs;

  @Value("${openrouter.resilience.request-timeout-ms:15000}")
  private int defaultRequestTimeoutMs;

  @Value("${openrouter.resilience.degraded-failure-threshold:2}")
  private int defaultDegradedFailureThreshold;

  @Value("${openrouter.resilience.unavailable-failure-threshold:4}")
  private int defaultUnavailableFailureThreshold;

  @Value("${openrouter.resilience.unavailable-cooldown-minutes:15}")
  private int defaultUnavailableCooldownMinutes;

  @Value("${openrouter.resilience.recovery-recheck-interval-minutes:5}")
  private int defaultRecoveryRecheckIntervalMinutes;

  @Value("${openrouter.resilience.health-checks-enabled:true}")
  private boolean defaultHealthChecksEnabled;

  @Value("${openrouter.api-key:}")
  private String fallbackOpenRouterApiKey;

  @Transactional
  public GlobalSettings getOrCreate() {
    GlobalSettings settings = globalSettingsRepository.findById(SINGLETON_ID).orElseGet(() -> {
      GlobalSettings created = new GlobalSettings();
      created.setId(SINGLETON_ID);
      return globalSettingsRepository.save(created);
    });
    if (settings.getAiTextCacheTtlDays() == null) {
      settings.setAiTextCacheTtlDays(DEFAULT_AI_TEXT_CACHE_TTL_DAYS);
    }
    if (settings.getOpenrouterHealthChecksEnabled() == null) {
      settings.setOpenrouterHealthChecksEnabled(defaultHealthChecksEnabled);
    }
    if (settings.getOpenrouterRetryCount() == null) {
      settings.setOpenrouterRetryCount(defaultRetryCount);
    }
    if (settings.getOpenrouterRetryBaseDelayMs() == null) {
      settings.setOpenrouterRetryBaseDelayMs(defaultRetryBaseDelayMs);
    }
    if (settings.getOpenrouterRetryMaxDelayMs() == null) {
      settings.setOpenrouterRetryMaxDelayMs(defaultRetryMaxDelayMs);
    }
    if (settings.getOpenrouterRequestTimeoutMs() == null) {
      settings.setOpenrouterRequestTimeoutMs(defaultRequestTimeoutMs);
    }
    if (settings.getOpenrouterDegradedFailureThreshold() == null) {
      settings.setOpenrouterDegradedFailureThreshold(defaultDegradedFailureThreshold);
    }
    if (settings.getOpenrouterUnavailableFailureThreshold() == null) {
      settings.setOpenrouterUnavailableFailureThreshold(defaultUnavailableFailureThreshold);
    }
    if (settings.getOpenrouterUnavailableCooldownMinutes() == null) {
      settings.setOpenrouterUnavailableCooldownMinutes(defaultUnavailableCooldownMinutes);
    }
    if (settings.getOpenrouterRecoveryRecheckIntervalMinutes() == null) {
      settings.setOpenrouterRecoveryRecheckIntervalMinutes(defaultRecoveryRecheckIntervalMinutes);
    }
    if (migrateLegacyPlainApiKey(settings)) {
      settings = globalSettingsRepository.save(settings);
    }
    return settings;
  }

  public long countActiveAiTextCacheEntries() {
    return aiTextCacheEntryRepository.countByInvalidatedAtIsNull();
  }

  public boolean isAiTextCacheEnabled() {
    return getOrCreate().isAiTextCacheEnabled();
  }

  public int resolveAiTextCacheTtlDays() {
    Integer configured = getOrCreate().getAiTextCacheTtlDays();
    return normalizeAiTextCacheTtlDays(configured);
  }

  public boolean resolveHealthChecksEnabled() {
    return Boolean.TRUE.equals(getOrCreate().getOpenrouterHealthChecksEnabled());
  }

  public int resolveRetryCount() {
    return normalizeRetryCount(getOrCreate().getOpenrouterRetryCount());
  }

  public int resolveRetryBaseDelayMs() {
    return normalizeRetryBaseDelayMs(getOrCreate().getOpenrouterRetryBaseDelayMs());
  }

  public int resolveRetryMaxDelayMs() {
    GlobalSettings settings = getOrCreate();
    return normalizeRetryMaxDelayMs(settings.getOpenrouterRetryMaxDelayMs(), settings.getOpenrouterRetryBaseDelayMs());
  }

  public int resolveRequestTimeoutMs() {
    return normalizeRequestTimeoutMs(getOrCreate().getOpenrouterRequestTimeoutMs());
  }

  public int resolveDegradedFailureThreshold() {
    return normalizeDegradedFailureThreshold(getOrCreate().getOpenrouterDegradedFailureThreshold());
  }

  public int resolveUnavailableFailureThreshold() {
    GlobalSettings settings = getOrCreate();
    return normalizeUnavailableFailureThreshold(
        settings.getOpenrouterUnavailableFailureThreshold(),
        settings.getOpenrouterDegradedFailureThreshold()
    );
  }

  public int resolveUnavailableCooldownMinutes() {
    return normalizeUnavailableCooldownMinutes(getOrCreate().getOpenrouterUnavailableCooldownMinutes());
  }

  public int resolveRecoveryRecheckIntervalMinutes() {
    return normalizeRecoveryRecheckIntervalMinutes(getOrCreate().getOpenrouterRecoveryRecheckIntervalMinutes());
  }

  @Transactional
  public void markAiTextCacheCleanupAt(Instant cleanupAt) {
    GlobalSettings settings = getOrCreate();
    settings.setAiTextCacheLastCleanupAt(cleanupAt == null ? Instant.now() : cleanupAt);
    globalSettingsRepository.save(settings);
  }

  public String resolveApiKey(GlobalSettings settings) {
    if (settings != null) {
      String stored = decryptStoredApiKey(settings.getOpenrouterApiKey());
      if (stored != null && !stored.isBlank()) {
        return stored;
      }
    }
    return fallbackOpenRouterApiKey == null || fallbackOpenRouterApiKey.isBlank()
        ? null
        : fallbackOpenRouterApiKey.trim();
  }

  public boolean hasApiKey(GlobalSettings settings) {
    String raw = resolveApiKey(settings);
    return raw != null && !raw.isBlank();
  }

  public String maskStoredApiKey(String storedApiKey) {
    return maskApiKey(decryptStoredApiKey(storedApiKey));
  }

  public String maskApiKey(String rawApiKey) {
    if (rawApiKey == null || rawApiKey.isBlank()) {
      return "";
    }
    String trimmed = rawApiKey.trim();
    int visibleTail = Math.min(4, trimmed.length());
    return "•".repeat(Math.max(8, trimmed.length() - visibleTail)) + trimmed.substring(trimmed.length() - visibleTail);
  }

  public ResolvedModels resolveModels(GlobalSettings settings) {
    // ORB1: приоритет у новых упрощённых глобальных полей text/photo.
    String chat = resolveModel(
        firstNonBlank(settings == null ? null : settings.getOpenrouterTextModel(), settings == null ? null : settings.getChatModel())
    );
    String recognition = resolveModel(
        firstNonBlank(settings == null ? null : settings.getOpenrouterPhotoModel(), settings == null ? null : settings.getPhotoRecognitionModel())
    );
    String diagnosis = resolveModel(
        firstNonBlank(settings == null ? null : settings.getOpenrouterPhotoModel(), settings == null ? null : settings.getPhotoDiagnosisModel())
    );
    return new ResolvedModels(chat, recognition, diagnosis);
  }

  @Transactional
  public ModelsUpdateResult updateModels(AdminOpenRouterModelsUpdateRequest request) {
    GlobalSettings settings = getOrCreate();

    List<String> changedFields = new ArrayList<>();

    if (request != null && request.textModel() != null) {
      String nextText = normalizeModel(request.textModel());
      if (!Objects.equals(settings.getOpenrouterTextModel(), nextText)) {
        settings.setOpenrouterTextModel(nextText);
        changedFields.add("openrouterTextModel");
      }
      // Поддерживаем совместимость со старым полем chat_model.
      if (!Objects.equals(settings.getChatModel(), nextText)) {
        settings.setChatModel(nextText);
        changedFields.add("chatModel");
      }
    }

    if (request != null && request.photoModel() != null) {
      String nextPhoto = normalizeModel(request.photoModel());
      if (!Objects.equals(settings.getOpenrouterPhotoModel(), nextPhoto)) {
        settings.setOpenrouterPhotoModel(nextPhoto);
        changedFields.add("openrouterPhotoModel");
      }
      // Поддерживаем совместимость со старыми полями vision-моделей.
      if (!Objects.equals(settings.getPhotoRecognitionModel(), nextPhoto)) {
        settings.setPhotoRecognitionModel(nextPhoto);
        changedFields.add("photoRecognitionModel");
      }
      if (!Objects.equals(settings.getPhotoDiagnosisModel(), nextPhoto)) {
        settings.setPhotoDiagnosisModel(nextPhoto);
        changedFields.add("photoDiagnosisModel");
      }
    }

    if (request != null && request.textModelCheckIntervalMinutes() != null
        && !Objects.equals(settings.getTextModelCheckIntervalMinutes(), request.textModelCheckIntervalMinutes())) {
      settings.setTextModelCheckIntervalMinutes(normalizeCheckInterval(request.textModelCheckIntervalMinutes()));
      changedFields.add("textModelCheckIntervalMinutes");
    }

    if (request != null && request.photoModelCheckIntervalMinutes() != null
        && !Objects.equals(settings.getPhotoModelCheckIntervalMinutes(), request.photoModelCheckIntervalMinutes())) {
      settings.setPhotoModelCheckIntervalMinutes(normalizeCheckInterval(request.photoModelCheckIntervalMinutes()));
      changedFields.add("photoModelCheckIntervalMinutes");
    }

    if (request != null && request.healthChecksEnabled() != null
        && !Objects.equals(settings.getOpenrouterHealthChecksEnabled(), request.healthChecksEnabled())) {
      settings.setOpenrouterHealthChecksEnabled(request.healthChecksEnabled());
      changedFields.add("openrouterHealthChecksEnabled");
    }

    if (request != null && request.retryCount() != null) {
      Integer normalized = normalizeRetryCount(request.retryCount());
      if (!Objects.equals(settings.getOpenrouterRetryCount(), normalized)) {
        settings.setOpenrouterRetryCount(normalized);
        changedFields.add("openrouterRetryCount");
      }
    }

    if (request != null && request.retryBaseDelayMs() != null) {
      Integer normalized = normalizeRetryBaseDelayMs(request.retryBaseDelayMs());
      if (!Objects.equals(settings.getOpenrouterRetryBaseDelayMs(), normalized)) {
        settings.setOpenrouterRetryBaseDelayMs(normalized);
        changedFields.add("openrouterRetryBaseDelayMs");
      }
    }

    if (request != null && request.retryMaxDelayMs() != null) {
      Integer normalized = normalizeRetryMaxDelayMs(request.retryMaxDelayMs(), settings.getOpenrouterRetryBaseDelayMs());
      if (!Objects.equals(settings.getOpenrouterRetryMaxDelayMs(), normalized)) {
        settings.setOpenrouterRetryMaxDelayMs(normalized);
        changedFields.add("openrouterRetryMaxDelayMs");
      }
    }

    if (request != null && request.requestTimeoutMs() != null) {
      Integer normalized = normalizeRequestTimeoutMs(request.requestTimeoutMs());
      if (!Objects.equals(settings.getOpenrouterRequestTimeoutMs(), normalized)) {
        settings.setOpenrouterRequestTimeoutMs(normalized);
        changedFields.add("openrouterRequestTimeoutMs");
      }
    }

    if (request != null && request.degradedFailureThreshold() != null) {
      Integer normalized = normalizeDegradedFailureThreshold(request.degradedFailureThreshold());
      if (!Objects.equals(settings.getOpenrouterDegradedFailureThreshold(), normalized)) {
        settings.setOpenrouterDegradedFailureThreshold(normalized);
        changedFields.add("openrouterDegradedFailureThreshold");
      }
    }

    if (request != null && request.unavailableFailureThreshold() != null) {
      Integer normalized = normalizeUnavailableFailureThreshold(
          request.unavailableFailureThreshold(),
          settings.getOpenrouterDegradedFailureThreshold()
      );
      if (!Objects.equals(settings.getOpenrouterUnavailableFailureThreshold(), normalized)) {
        settings.setOpenrouterUnavailableFailureThreshold(normalized);
        changedFields.add("openrouterUnavailableFailureThreshold");
      }
    }

    if (request != null && request.unavailableCooldownMinutes() != null) {
      Integer normalized = normalizeUnavailableCooldownMinutes(request.unavailableCooldownMinutes());
      if (!Objects.equals(settings.getOpenrouterUnavailableCooldownMinutes(), normalized)) {
        settings.setOpenrouterUnavailableCooldownMinutes(normalized);
        changedFields.add("openrouterUnavailableCooldownMinutes");
      }
    }

    if (request != null && request.recoveryRecheckIntervalMinutes() != null) {
      Integer normalized = normalizeRecoveryRecheckIntervalMinutes(request.recoveryRecheckIntervalMinutes());
      if (!Objects.equals(settings.getOpenrouterRecoveryRecheckIntervalMinutes(), normalized)) {
        settings.setOpenrouterRecoveryRecheckIntervalMinutes(normalized);
        changedFields.add("openrouterRecoveryRecheckIntervalMinutes");
      }
    }

    if (request != null && request.aiTextCacheEnabled() != null
        && settings.isAiTextCacheEnabled() != request.aiTextCacheEnabled()) {
      settings.setAiTextCacheEnabled(request.aiTextCacheEnabled());
      changedFields.add("aiTextCacheEnabled");
    }

    if (request != null && request.aiTextCacheTtlDays() != null) {
      Integer normalizedTtlDays = normalizeAiTextCacheTtlDays(request.aiTextCacheTtlDays());
      if (!Objects.equals(settings.getAiTextCacheTtlDays(), normalizedTtlDays)) {
        settings.setAiTextCacheTtlDays(normalizedTtlDays);
        changedFields.add("aiTextCacheTtlDays");
      }
    }

    GlobalSettings saved = globalSettingsRepository.save(settings);
    ResolvedModels resolved = resolveModels(saved);
    return new ModelsUpdateResult(
        saved,
        List.copyOf(changedFields),
        resolved.chatModel(),
        resolved.photoRecognitionModel(),
        hasApiKey(saved)
    );
  }

  private String resolveModel(String currentValue) {
    return normalizeModel(currentValue);
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }

  private String encryptApiKey(String rawApiKey) {
    String encrypted = cryptoService.encrypt(rawApiKey);
    return ENC_PREFIX + encrypted;
  }

  private boolean migrateLegacyPlainApiKey(GlobalSettings settings) {
    if (settings == null) {
      return false;
    }
    String stored = settings.getOpenrouterApiKey();
    if (stored == null || stored.isBlank()) {
      return false;
    }
    if (stored.trim().startsWith(ENC_PREFIX)) {
      return false;
    }
    settings.setOpenrouterApiKey(encryptApiKey(stored.trim()));
    return true;
  }

  private String decryptStoredApiKey(String storedApiKey) {
    if (storedApiKey == null || storedApiKey.isBlank()) {
      return null;
    }

    String value = storedApiKey.trim();
    if (!value.startsWith(ENC_PREFIX)) {
      // Легаси-значение: хранилось в plain-text до OR2.
      return value;
    }

    String encryptedPart = value.substring(ENC_PREFIX.length()).trim();
    if (encryptedPart.isEmpty()) {
      return null;
    }

    try {
      return cryptoService.decrypt(encryptedPart);
    } catch (Exception ex) {
      log.warn("OpenRouter global key decrypt failed: {}", ex.getMessage());
      return null;
    }
  }

  private String normalizeModel(String value) {
    if (value == null) {
      return null;
    }
    String cleaned = value.trim();
    if (cleaned.isEmpty()) {
      return null;
    }
    String[] commaParts = cleaned.split(",");
    if (commaParts.length > 0) {
      cleaned = commaParts[0].trim();
    }
    String[] tokenized = cleaned.split("\\s+");
    if (tokenized.length > 0) {
      cleaned = tokenized[0].trim();
    }
    return cleaned.isEmpty() ? null : cleaned;
  }

  private Integer normalizeCheckInterval(Integer minutes) {
    if (minutes == null) {
      return null;
    }
    if (minutes <= 0) {
      return 0;
    }
    return Math.min(minutes, 24 * 60);
  }

  private Integer normalizeRetryCount(Integer count) {
    if (count == null) {
      return defaultRetryCount;
    }
    return Math.max(0, Math.min(count, 5));
  }

  private Integer normalizeRetryBaseDelayMs(Integer value) {
    if (value == null) {
      return defaultRetryBaseDelayMs;
    }
    return Math.max(100, Math.min(value, 30_000));
  }

  private Integer normalizeRetryMaxDelayMs(Integer value, Integer baseDelay) {
    int normalizedBase = normalizeRetryBaseDelayMs(baseDelay);
    if (value == null) {
      return Math.max(normalizedBase, defaultRetryMaxDelayMs);
    }
    return Math.max(normalizedBase, Math.min(value, 60_000));
  }

  private Integer normalizeRequestTimeoutMs(Integer value) {
    if (value == null) {
      return defaultRequestTimeoutMs;
    }
    return Math.max(1_000, Math.min(value, 120_000));
  }

  private Integer normalizeDegradedFailureThreshold(Integer value) {
    if (value == null) {
      return defaultDegradedFailureThreshold;
    }
    return Math.max(1, Math.min(value, 20));
  }

  private Integer normalizeUnavailableFailureThreshold(Integer value, Integer degradedThreshold) {
    int normalizedDegraded = normalizeDegradedFailureThreshold(degradedThreshold);
    if (value == null) {
      return Math.max(normalizedDegraded + 1, defaultUnavailableFailureThreshold);
    }
    return Math.max(normalizedDegraded + 1, Math.min(value, 30));
  }

  private Integer normalizeUnavailableCooldownMinutes(Integer value) {
    if (value == null) {
      return defaultUnavailableCooldownMinutes;
    }
    return Math.max(1, Math.min(value, 24 * 60));
  }

  private Integer normalizeRecoveryRecheckIntervalMinutes(Integer value) {
    if (value == null) {
      return defaultRecoveryRecheckIntervalMinutes;
  }
    return Math.max(1, Math.min(value, 24 * 60));
  }

  private Integer normalizeAiTextCacheTtlDays(Integer ttlDays) {
    if (ttlDays == null) {
      return DEFAULT_AI_TEXT_CACHE_TTL_DAYS;
    }
    return Math.max(MIN_AI_TEXT_CACHE_TTL_DAYS, Math.min(MAX_AI_TEXT_CACHE_TTL_DAYS, ttlDays));
  }

  public record ResolvedModels(
      String chatModel,
      String photoRecognitionModel,
      String photoDiagnosisModel
  ) {
  }

  public record ModelsUpdateResult(
      GlobalSettings settings,
      List<String> changedFields,
      String textModel,
      String photoModel,
      boolean hasApiKey
  ) {
  }
}
