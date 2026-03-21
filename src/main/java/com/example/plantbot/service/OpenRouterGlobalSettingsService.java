package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOpenRouterModelsUpdateRequest;
import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.repository.GlobalSettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
public class OpenRouterGlobalSettingsService {
  private static final long SINGLETON_ID = 1L;
  private static final String ENC_PREFIX = "enc::";

  private final GlobalSettingsRepository globalSettingsRepository;
  private final OpenRouterApiKeyCryptoService cryptoService;

  @Transactional
  public GlobalSettings getOrCreate() {
    GlobalSettings settings = globalSettingsRepository.findById(SINGLETON_ID).orElseGet(() -> {
      GlobalSettings created = new GlobalSettings();
      created.setId(SINGLETON_ID);
      return globalSettingsRepository.save(created);
    });
    if (migrateLegacyPlainApiKey(settings)) {
      settings = globalSettingsRepository.save(settings);
    }
    return settings;
  }

  public String resolveApiKey(GlobalSettings settings) {
    if (settings == null) {
      return null;
    }
    return decryptStoredApiKey(settings.getOpenrouterApiKey());
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
