package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminAiSettingsUpdateRequest;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.GlobalSettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiProviderSettingsService {
  private static final long SINGLETON_ID = 1L;
  private static final String ENC_PREFIX = "enc::";

  private final GlobalSettingsRepository globalSettingsRepository;
  private final OpenRouterApiKeyCryptoService cryptoService;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelCatalogService openRouterModelCatalogService;

  @Value("${openai.api-key:}")
  private String fallbackOpenAiApiKey;

  @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
  private String fallbackOpenAiBaseUrl;

  @Value("${openai.model-text:gpt-4o-mini}")
  private String fallbackOpenAiTextModel;

  @Value("${openai.model-vision:gpt-4o-mini}")
  private String fallbackOpenAiVisionModel;

  @Transactional
  public GlobalSettings getOrCreate() {
    GlobalSettings settings = globalSettingsRepository.findById(SINGLETON_ID).orElseGet(() -> {
      GlobalSettings created = new GlobalSettings();
      created.setId(SINGLETON_ID);
      return globalSettingsRepository.save(created);
    });
    if (settings.getActiveTextProvider() == null) {
      settings.setActiveTextProvider(AiProviderType.OPENROUTER);
    }
    if (settings.getActiveVisionProvider() == null) {
      settings.setActiveVisionProvider(AiProviderType.OPENROUTER);
    }
    boolean changed = migrateLegacyProviderSettings(settings);
    if (migrateLegacyPlainApiKey(settings)) {
      changed = true;
    }
    if (changed) {
      settings = globalSettingsRepository.save(settings);
    }
    return settings;
  }

  public RuntimeResolution resolveTextRuntime(User user) {
    return resolveRuntime(user, AiCapability.TEXT);
  }

  public RuntimeResolution resolveVisionRuntime(User user) {
    return resolveRuntime(user, AiCapability.VISION);
  }

  public RuntimeResolution resolveRuntime(User user, AiCapability capability) {
    GlobalSettings settings = getOrCreate();
    AiProviderType provider = capability == AiCapability.VISION
        ? defaultProvider(settings.getActiveVisionProvider())
        : defaultProvider(settings.getActiveTextProvider());
    String model = resolveConfiguredModel(settings, user, provider, capability);
    String apiKey = resolveApiKey(settings, provider);
    return new RuntimeResolution(
        provider,
        capability,
        normalizeModel(model),
        apiKey == null ? null : apiKey.trim(),
        normalizeBaseUrl(resolveBaseUrl(settings, provider)),
        resolveRequestTimeoutMs(settings, provider),
        resolveMaxTokens(settings, provider),
        apiKey != null && !apiKey.isBlank()
    );
  }

  public String resolveApiKey(GlobalSettings settings, AiProviderType provider) {
    if (provider == AiProviderType.OPENAI_COMPATIBLE || provider == AiProviderType.OPENAI) {
      String global = decryptStoredApiKey(firstNonBlank(
          settings == null ? null : settings.getOpenaiCompatibleApiKey(),
          settings == null ? null : settings.getOpenaiApiKey()
      ));
      if (global != null && !global.isBlank()) {
        return global;
      }
      return fallbackOpenAiApiKey;
    }
    return openRouterGlobalSettingsService.resolveApiKey(settings == null ? getOrCreate() : settings);
  }

  public boolean hasApiKey(GlobalSettings settings, AiProviderType provider) {
    String apiKey = resolveApiKey(settings, provider);
    return apiKey != null && !apiKey.isBlank();
  }

  public ProviderSettingsSummary summarize(GlobalSettings settings, User user) {
    GlobalSettings effectiveSettings = settings == null ? getOrCreate() : settings;
    RuntimeResolution textRuntime = resolveRuntime(user, AiCapability.TEXT);
    RuntimeResolution visionRuntime = resolveRuntime(user, AiCapability.VISION);
    return new ProviderSettingsSummary(
        defaultProvider(effectiveSettings.getActiveTextProvider()),
        defaultProvider(effectiveSettings.getActiveVisionProvider()),
        normalizeModel(effectiveSettings.getOpenrouterTextModel()),
        normalizeModel(effectiveSettings.getOpenrouterPhotoModel()),
        normalizeModel(firstNonBlank(effectiveSettings.getOpenaiCompatibleTextModel(), effectiveSettings.getOpenaiTextModel())),
        normalizeModel(firstNonBlank(effectiveSettings.getOpenaiCompatibleVisionModel(), effectiveSettings.getOpenaiVisionModel())),
        normalizeBaseUrl(firstNonBlank(effectiveSettings.getOpenaiCompatibleBaseUrl(), fallbackOpenAiBaseUrl)),
        textRuntime.model(),
        visionRuntime.model(),
        hasApiKey(effectiveSettings, AiProviderType.OPENROUTER),
        hasApiKey(effectiveSettings, AiProviderType.OPENAI_COMPATIBLE)
    );
  }

  @Transactional
  public UpdateResult update(AdminAiSettingsUpdateRequest request) {
    GlobalSettings settings = getOrCreate();
    List<String> changedFields = new ArrayList<>();

    if (request != null && request.activeTextProvider() != null) {
      AiProviderType normalized = defaultProvider(request.activeTextProvider());
      if (!Objects.equals(settings.getActiveTextProvider(), normalized)) {
        settings.setActiveTextProvider(normalized);
        changedFields.add("activeTextProvider");
      }
    }

    if (request != null && request.activeVisionProvider() != null) {
      AiProviderType normalized = defaultProvider(request.activeVisionProvider());
      if (!Objects.equals(settings.getActiveVisionProvider(), normalized)) {
        settings.setActiveVisionProvider(normalized);
        changedFields.add("activeVisionProvider");
      }
    }

    if (request != null && request.openrouterTextModel() != null) {
      String normalized = normalizeModel(request.openrouterTextModel());
      if (!Objects.equals(settings.getOpenrouterTextModel(), normalized)) {
        settings.setOpenrouterTextModel(normalized);
        settings.setChatModel(normalized);
        changedFields.add("openrouterTextModel");
      }
    }

    if (request != null && request.openrouterVisionModel() != null) {
      String normalized = normalizeModel(request.openrouterVisionModel());
      if (!Objects.equals(settings.getOpenrouterPhotoModel(), normalized)) {
        settings.setOpenrouterPhotoModel(normalized);
        settings.setPhotoRecognitionModel(normalized);
        settings.setPhotoDiagnosisModel(normalized);
        changedFields.add("openrouterVisionModel");
      }
    }

    if (request != null && request.openaiCompatibleTextModel() != null) {
      String normalized = normalizeModel(request.openaiCompatibleTextModel());
      if (!Objects.equals(settings.getOpenaiCompatibleTextModel(), normalized)) {
        settings.setOpenaiCompatibleTextModel(normalized);
        settings.setOpenaiTextModel(normalized);
        changedFields.add("openaiCompatibleTextModel");
      }
    }

    if (request != null && request.openaiCompatibleVisionModel() != null) {
      String normalized = normalizeModel(request.openaiCompatibleVisionModel());
      if (!Objects.equals(settings.getOpenaiCompatibleVisionModel(), normalized)) {
        settings.setOpenaiCompatibleVisionModel(normalized);
        settings.setOpenaiVisionModel(normalized);
        changedFields.add("openaiCompatibleVisionModel");
      }
    }

    if (request != null && request.openaiCompatibleApiKey() != null) {
      String normalized = normalizeSecret(request.openaiCompatibleApiKey());
      String encrypted = normalized == null ? null : encryptApiKey(normalized);
      if (!Objects.equals(settings.getOpenaiCompatibleApiKey(), encrypted)) {
        settings.setOpenaiCompatibleApiKey(encrypted);
        settings.setOpenaiApiKey(encrypted);
        changedFields.add("openaiCompatibleApiKey");
      }
    }

    if (request != null && request.openaiCompatibleBaseUrl() != null) {
      String normalized = normalizeBaseUrl(request.openaiCompatibleBaseUrl());
      if (!Objects.equals(settings.getOpenaiCompatibleBaseUrl(), normalized)) {
        settings.setOpenaiCompatibleBaseUrl(normalized);
        changedFields.add("openaiCompatibleBaseUrl");
      }
    }

    if (request != null && request.openaiCompatibleRequestTimeoutMs() != null) {
      Integer normalized = normalizeRequestTimeoutMs(request.openaiCompatibleRequestTimeoutMs());
      if (!Objects.equals(settings.getOpenaiCompatibleRequestTimeoutMs(), normalized)) {
        settings.setOpenaiCompatibleRequestTimeoutMs(normalized);
        changedFields.add("openaiCompatibleRequestTimeoutMs");
      }
    }

    if (request != null && request.openaiCompatibleMaxTokens() != null) {
      Integer normalized = normalizeMaxTokens(request.openaiCompatibleMaxTokens());
      if (!Objects.equals(settings.getOpenaiCompatibleMaxTokens(), normalized)) {
        settings.setOpenaiCompatibleMaxTokens(normalized);
        changedFields.add("openaiCompatibleMaxTokens");
      }
    }

    GlobalSettings saved = globalSettingsRepository.save(settings);
    return new UpdateResult(saved, List.copyOf(changedFields), summarize(saved, null));
  }

  public String maskApiKey(GlobalSettings settings, AiProviderType provider) {
    String raw = resolveApiKey(settings, provider);
    if (raw == null || raw.isBlank()) {
      return "";
    }
    String trimmed = raw.trim();
    int visibleTail = Math.min(4, trimmed.length());
    return "•".repeat(Math.max(8, trimmed.length() - visibleTail)) + trimmed.substring(trimmed.length() - visibleTail);
  }

  public String resolveConfiguredModel(GlobalSettings settings, User user, AiProviderType provider, AiCapability capability) {
    GlobalSettings effectiveSettings = settings == null ? getOrCreate() : settings;
    if (provider == AiProviderType.OPENAI_COMPATIBLE || provider == AiProviderType.OPENAI) {
      if (capability == AiCapability.VISION) {
        return firstNonBlank(effectiveSettings.getOpenaiCompatibleVisionModel(), effectiveSettings.getOpenaiVisionModel(), fallbackOpenAiVisionModel);
      }
      return firstNonBlank(effectiveSettings.getOpenaiCompatibleTextModel(), effectiveSettings.getOpenaiTextModel(), fallbackOpenAiTextModel);
    }
    OpenRouterGlobalSettingsService.ResolvedModels openRouterModels = openRouterGlobalSettingsService.resolveModels(effectiveSettings);
    if (capability == AiCapability.VISION) {
      return firstNonBlank(
          effectiveSettings.getOpenrouterPhotoModel(),
          openRouterModels.photoRecognitionModel(),
          openRouterModelCatalogService.resolveConfiguredPhotoFallback(),
          hasApiKey(effectiveSettings, AiProviderType.OPENROUTER) ? openRouterModelCatalogService.resolveDynamicPhotoFallback(user) : null
      );
    }
    return firstNonBlank(
        effectiveSettings.getOpenrouterTextModel(),
        openRouterModels.chatModel(),
        openRouterModelCatalogService.resolveConfiguredTextFallback(),
        hasApiKey(effectiveSettings, AiProviderType.OPENROUTER) ? openRouterModelCatalogService.resolveDynamicTextFallback(user) : null
    );
  }

  private AiProviderType defaultProvider(AiProviderType provider) {
    if (provider == null) {
      return AiProviderType.OPENROUTER;
    }
    return provider == AiProviderType.OPENAI ? AiProviderType.OPENAI_COMPATIBLE : provider;
  }

  public String resolveBaseUrl(GlobalSettings settings, AiProviderType provider) {
    if (provider != AiProviderType.OPENAI_COMPATIBLE && provider != AiProviderType.OPENAI) {
      return null;
    }
    return normalizeBaseUrl(firstNonBlank(
        settings == null ? null : settings.getOpenaiCompatibleBaseUrl(),
        fallbackOpenAiBaseUrl
    ));
  }

  public Integer resolveRequestTimeoutMs(GlobalSettings settings, AiProviderType provider) {
    if (provider != AiProviderType.OPENAI_COMPATIBLE && provider != AiProviderType.OPENAI) {
      return null;
    }
    return normalizeRequestTimeoutMs(settings == null ? null : settings.getOpenaiCompatibleRequestTimeoutMs());
  }

  public Integer resolveMaxTokens(GlobalSettings settings, AiProviderType provider) {
    if (provider != AiProviderType.OPENAI_COMPATIBLE && provider != AiProviderType.OPENAI) {
      return null;
    }
    return normalizeMaxTokens(settings == null ? null : settings.getOpenaiCompatibleMaxTokens());
  }

  public RuntimeResolution resolveTestRuntime(String baseUrl,
                                             String apiKey,
                                             String textModel,
                                             String visionModel,
                                             Integer requestTimeoutMs,
                                             Integer maxTokens,
                                             User user,
                                             AiCapability capability) {
    GlobalSettings settings = getOrCreate();
    String normalizedModel = capability == AiCapability.VISION ? normalizeModel(visionModel) : normalizeModel(textModel);
    if (normalizedModel == null) {
      normalizedModel = resolveConfiguredModel(settings, user, AiProviderType.OPENAI_COMPATIBLE, capability);
    }
    String normalizedApiKey = normalizeSecret(apiKey);
    if (normalizedApiKey == null) {
      normalizedApiKey = resolveApiKey(settings, AiProviderType.OPENAI_COMPATIBLE);
    }
    String normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (normalizedBaseUrl == null) {
      normalizedBaseUrl = resolveBaseUrl(settings, AiProviderType.OPENAI_COMPATIBLE);
    }
    Integer normalizedTimeout = normalizeRequestTimeoutMs(requestTimeoutMs);
    if (normalizedTimeout == null) {
      normalizedTimeout = resolveRequestTimeoutMs(settings, AiProviderType.OPENAI_COMPATIBLE);
    }
    Integer normalizedMaxTokens = normalizeMaxTokens(maxTokens);
    if (normalizedMaxTokens == null) {
      normalizedMaxTokens = resolveMaxTokens(settings, AiProviderType.OPENAI_COMPATIBLE);
    }
    return new RuntimeResolution(
        AiProviderType.OPENAI_COMPATIBLE,
        capability,
        normalizedModel,
        normalizedApiKey,
        normalizedBaseUrl,
        normalizedTimeout,
        normalizedMaxTokens,
        normalizedApiKey != null && !normalizedApiKey.isBlank()
    );
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
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

  private String normalizeSecret(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String normalizeBaseUrl(String value) {
    String normalized = normalizeSecret(value);
    if (normalized == null) {
      return null;
    }
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }

  private Integer normalizeRequestTimeoutMs(Integer value) {
    if (value == null) {
      return null;
    }
    return Math.max(1_000, Math.min(120_000, value));
  }

  private Integer normalizeMaxTokens(Integer value) {
    if (value == null) {
      return null;
    }
    return Math.max(1, Math.min(32_000, value));
  }

  private String encryptApiKey(String rawApiKey) {
    return ENC_PREFIX + cryptoService.encrypt(rawApiKey);
  }

  private boolean migrateLegacyPlainApiKey(GlobalSettings settings) {
    if (settings == null) {
      return false;
    }
    String stored = settings.getOpenaiApiKey();
    if (stored == null || stored.isBlank() || stored.trim().startsWith(ENC_PREFIX)) {
      return false;
    }
    settings.setOpenaiApiKey(encryptApiKey(stored.trim()));
    return true;
  }

  private boolean migrateLegacyProviderSettings(GlobalSettings settings) {
    if (settings == null) {
      return false;
    }
    boolean changed = false;
    if (settings.getActiveTextProvider() == AiProviderType.OPENAI) {
      settings.setActiveTextProvider(AiProviderType.OPENAI_COMPATIBLE);
      changed = true;
    }
    if (settings.getActiveVisionProvider() == AiProviderType.OPENAI) {
      settings.setActiveVisionProvider(AiProviderType.OPENAI_COMPATIBLE);
      changed = true;
    }
    if (settings.getOpenaiCompatibleApiKey() == null && settings.getOpenaiApiKey() != null) {
      settings.setOpenaiCompatibleApiKey(settings.getOpenaiApiKey());
      changed = true;
    }
    if (settings.getOpenaiCompatibleTextModel() == null && settings.getOpenaiTextModel() != null) {
      settings.setOpenaiCompatibleTextModel(settings.getOpenaiTextModel());
      changed = true;
    }
    if (settings.getOpenaiCompatibleVisionModel() == null && settings.getOpenaiVisionModel() != null) {
      settings.setOpenaiCompatibleVisionModel(settings.getOpenaiVisionModel());
      changed = true;
    }
    if (settings.getOpenaiCompatibleBaseUrl() == null && fallbackOpenAiBaseUrl != null && !fallbackOpenAiBaseUrl.isBlank()) {
      settings.setOpenaiCompatibleBaseUrl(normalizeBaseUrl(fallbackOpenAiBaseUrl));
      changed = true;
    }
    return changed;
  }

  private String decryptStoredApiKey(String storedApiKey) {
    if (storedApiKey == null || storedApiKey.isBlank()) {
      return null;
    }
    String value = storedApiKey.trim();
    if (!value.startsWith(ENC_PREFIX)) {
      return value;
    }
    String encryptedPart = value.substring(ENC_PREFIX.length()).trim();
    if (encryptedPart.isEmpty()) {
      return null;
    }
    try {
      return cryptoService.decrypt(encryptedPart);
    } catch (Exception ex) {
      log.warn("AI provider key decrypt failed: {}", ex.getMessage());
      return null;
    }
  }

  public record RuntimeResolution(
      AiProviderType provider,
      AiCapability capability,
      String model,
      String apiKey,
      String baseUrl,
      Integer requestTimeoutMs,
      Integer maxTokens,
      boolean hasApiKey
  ) {
    public String analyticsModelKey() {
      return backendKey() + ":" + (model == null ? "unknown" : model);
    }

    public String sourceLabel() {
      return backendKey() + ":" + (model == null ? "unknown" : model);
    }

    public String backendKey() {
      if (provider == AiProviderType.OPENAI_COMPATIBLE || provider == AiProviderType.OPENAI) {
        return provider.name() + ":" + (baseUrl == null ? "default" : baseUrl);
      }
      return provider.name();
    }
  }

  public record ProviderSettingsSummary(
      AiProviderType activeTextProvider,
      AiProviderType activeVisionProvider,
      String openrouterTextModel,
      String openrouterVisionModel,
      String openaiCompatibleTextModel,
      String openaiCompatibleVisionModel,
      String openaiCompatibleBaseUrl,
      String effectiveTextModel,
      String effectiveVisionModel,
      boolean openrouterHasApiKey,
      boolean openaiCompatibleHasApiKey
  ) {
  }

  public record UpdateResult(
      GlobalSettings settings,
      List<String> changedFields,
      ProviderSettingsSummary summary
  ) {
  }
}
