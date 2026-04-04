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
    if (migrateLegacyPlainApiKey(settings)) {
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
        apiKey != null && !apiKey.isBlank()
    );
  }

  public String resolveApiKey(GlobalSettings settings, AiProviderType provider) {
    if (provider == AiProviderType.OPENAI) {
      String global = decryptStoredApiKey(settings == null ? null : settings.getOpenaiApiKey());
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
        normalizeModel(effectiveSettings.getOpenaiTextModel()),
        normalizeModel(effectiveSettings.getOpenaiVisionModel()),
        textRuntime.model(),
        visionRuntime.model(),
        hasApiKey(effectiveSettings, AiProviderType.OPENROUTER),
        hasApiKey(effectiveSettings, AiProviderType.OPENAI)
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

    if (request != null && request.openaiTextModel() != null) {
      String normalized = normalizeModel(request.openaiTextModel());
      if (!Objects.equals(settings.getOpenaiTextModel(), normalized)) {
        settings.setOpenaiTextModel(normalized);
        changedFields.add("openaiTextModel");
      }
    }

    if (request != null && request.openaiVisionModel() != null) {
      String normalized = normalizeModel(request.openaiVisionModel());
      if (!Objects.equals(settings.getOpenaiVisionModel(), normalized)) {
        settings.setOpenaiVisionModel(normalized);
        changedFields.add("openaiVisionModel");
      }
    }

    if (request != null && request.openaiApiKey() != null) {
      String normalized = normalizeSecret(request.openaiApiKey());
      String encrypted = normalized == null ? null : encryptApiKey(normalized);
      if (!Objects.equals(settings.getOpenaiApiKey(), encrypted)) {
        settings.setOpenaiApiKey(encrypted);
        changedFields.add("openaiApiKey");
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
    if (provider == AiProviderType.OPENAI) {
      if (capability == AiCapability.VISION) {
        return firstNonBlank(effectiveSettings.getOpenaiVisionModel(), fallbackOpenAiVisionModel);
      }
      return firstNonBlank(effectiveSettings.getOpenaiTextModel(), fallbackOpenAiTextModel);
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
    return provider == null ? AiProviderType.OPENROUTER : provider;
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
      boolean hasApiKey
  ) {
    public String analyticsModelKey() {
      return provider.name() + ":" + (model == null ? "unknown" : model);
    }

    public String sourceLabel() {
      return provider.name() + ":" + (model == null ? "unknown" : model);
    }
  }

  public record ProviderSettingsSummary(
      AiProviderType activeTextProvider,
      AiProviderType activeVisionProvider,
      String openrouterTextModel,
      String openrouterVisionModel,
      String openaiTextModel,
      String openaiVisionModel,
      String effectiveTextModel,
      String effectiveVisionModel,
      boolean openrouterHasApiKey,
      boolean openaiHasApiKey
  ) {
  }

  public record UpdateResult(
      GlobalSettings settings,
      List<String> changedFields,
      ProviderSettingsSummary summary
  ) {
  }
}
