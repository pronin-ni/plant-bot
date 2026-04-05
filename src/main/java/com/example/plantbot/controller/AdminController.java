package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantActionResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminBulkPlantWaterRequest;
import com.example.plantbot.controller.dto.admin.AdminBulkPlantWaterResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantUpdateRequest;
import com.example.plantbot.controller.dto.admin.AdminUserActionResponse;
import com.example.plantbot.controller.dto.admin.AdminUserBlockRequest;
import com.example.plantbot.controller.dto.admin.AdminUserDetailsResponse;
import com.example.plantbot.controller.dto.admin.AdminBackupItemResponse;
import com.example.plantbot.controller.dto.admin.AdminBackupRestoreResponse;
import com.example.plantbot.controller.dto.admin.AdminCacheClearResponse;
import com.example.plantbot.controller.dto.admin.AdminScopedCacheClearResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskItemResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskRetryResponse;
import com.example.plantbot.controller.dto.admin.AdminPushTestRequest;
import com.example.plantbot.controller.dto.admin.AdminPushTestResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.controller.dto.admin.AdminActivityLogItemResponse;
import com.example.plantbot.controller.dto.admin.AdminMagicLinkAuditItemResponse;
import com.example.plantbot.controller.dto.admin.AdminMonitoringResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenRouterModelsResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenRouterModelsUpdateRequest;
import com.example.plantbot.controller.dto.admin.AdminOpenRouterAvailabilityCheckResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenRouterTestRequest;
import com.example.plantbot.controller.dto.admin.AdminOpenRouterTestResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleCapabilityTestResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleModelsRequest;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleModelsResponse;
import com.example.plantbot.controller.dto.admin.AdminOpenAiCompatibleTestRequest;
import com.example.plantbot.controller.dto.admin.AdminAiAnalyticsResponse;
import com.example.plantbot.controller.dto.admin.AdminAiSettingsResponse;
import com.example.plantbot.controller.dto.admin.AdminAiSettingsUpdateRequest;
import com.example.plantbot.domain.AiAnalyticsPeriod;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import com.example.plantbot.service.AdminService;
import com.example.plantbot.service.AiExecutionService;
import com.example.plantbot.service.AiProviderSettingsService;
import com.example.plantbot.service.AiRequestAnalyticsService;
import com.example.plantbot.service.OpenAiCompatibleAdminTestService;
import com.example.plantbot.service.OpenAiCompatibleModelCatalogService;
import com.example.plantbot.service.OpenRouterGlobalSettingsService;
import com.example.plantbot.service.OpenRouterModelAvailabilityCheckService;
import com.example.plantbot.service.OpenRouterModelAvailabilityPersistenceService;
import com.example.plantbot.service.OpenRouterModelCatalogService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.AiTextCacheService;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.service.DatabaseBackupScheduler;
import com.example.plantbot.service.WebPushNotificationService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.config.AdminRateLimitInterceptor;
import com.example.plantbot.service.AdminInsightsService;
import com.example.plantbot.service.auth.MagicLinkAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
  private final UserRepository userRepository;
  private final AdminService adminService;
  private final PlantCatalogService plantCatalogService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  private final WeatherService weatherService;
  private final PlantService plantService;
  private final AdminRateLimitInterceptor adminRateLimitInterceptor;
  private final AdminInsightsService adminInsightsService;
  private final MagicLinkAuditService magicLinkAuditService;
  private final DatabaseBackupScheduler databaseBackupScheduler;
  private final WebPushNotificationService webPushNotificationService;
  private final AiProviderSettingsService aiProviderSettingsService;
  private final AiExecutionService aiExecutionService;
  private final AiRequestAnalyticsService aiRequestAnalyticsService;
  private final OpenAiCompatibleAdminTestService openAiCompatibleAdminTestService;
  private final OpenAiCompatibleModelCatalogService openAiCompatibleModelCatalogService;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final OpenRouterModelAvailabilityCheckService openRouterModelAvailabilityCheckService;
  private final OpenRouterModelAvailabilityPersistenceService openRouterModelAvailabilityPersistenceService;
  private final OpenRouterModelCatalogService openRouterModelCatalogService;
  private final AiTextCacheService aiTextCacheService;
  @Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @GetMapping("/overview")
  public AdminOverviewResponse overview(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin overview requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return adminService.overview();
  }

  @GetMapping("/users")
  public AdminUsersResponse users(
      Authentication authentication,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "q", required = false) String q
  ) {
    User admin = requireAdmin(authentication);
    log.info("Admin users requested: userId={} telegramId={} page={} size={} q={}", admin.getId(), admin.getTelegramId(), page, size, q);
    return adminService.users(page, size, q);
  }

  @GetMapping("/users/{userId}/details")
  public AdminUserDetailsResponse userDetails(
      Authentication authentication,
      @PathVariable("userId") Long userId
  ) {
    User admin = requireAdmin(authentication);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    log.info("Admin user details requested: adminUserId={} adminTelegramId={} targetUserId={}",
        admin.getId(), admin.getTelegramId(), userId);
    return adminService.userDetails(user);
  }

  @PostMapping("/users/{userId}/block")
  public AdminUserActionResponse blockUser(
      Authentication authentication,
      @PathVariable("userId") Long userId,
      @RequestBody(required = false) AdminUserBlockRequest request
  ) {
    User admin = requireAdmin(authentication);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    boolean blocked = adminService.setBlocked(admin, user, request == null ? null : request.blocked());
    log.warn("Admin user block toggled: adminUserId={} adminTelegramId={} targetUserId={} blocked={}",
        admin.getId(), admin.getTelegramId(), userId, blocked);
    return new AdminUserActionResponse(true, userId, blocked ? "Пользователь заблокирован" : "Пользователь разблокирован");
  }

  @DeleteMapping("/users/{userId}")
  public AdminUserActionResponse deleteUser(
      Authentication authentication,
      @PathVariable("userId") Long userId
  ) {
    User admin = requireAdmin(authentication);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    adminService.deleteUser(admin, user);
    log.warn("Admin user deleted: adminUserId={} adminTelegramId={} targetUserId={}",
        admin.getId(), admin.getTelegramId(), userId);
    return new AdminUserActionResponse(true, userId, "Пользователь удалён");
  }

  @GetMapping("/users/{userId}/plants")
  public List<AdminPlantItemResponse> userPlants(
      Authentication authentication,
      @PathVariable("userId") Long userId
  ) {
    User admin = requireAdmin(authentication);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    log.info("Admin user plants requested: adminUserId={} adminTelegramId={} targetUserId={}", admin.getId(), admin.getTelegramId(), userId);
    return adminService.userPlants(user);
  }

  @GetMapping("/stats")
  public AdminStatsResponse stats(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin stats requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return adminService.stats();
  }

  @GetMapping("/monitoring")
  public AdminMonitoringResponse monitoring(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin monitoring requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return adminInsightsService.monitoring();
  }

  @GetMapping("/ai/settings")
  public AdminAiSettingsResponse aiSettings(Authentication authentication) {
    User admin = requireAdmin(authentication);
    var settings = aiProviderSettingsService.getOrCreate();
    var summary = aiProviderSettingsService.summarize(settings, admin);
    log.info("Admin AI settings requested: userId={} telegramId={} textProvider={} visionProvider={}",
        admin.getId(), admin.getTelegramId(), summary.activeTextProvider(), summary.activeVisionProvider());
    return toAdminAiSettingsResponse(settings, summary);
  }

  @PutMapping("/ai/settings")
  public AdminAiSettingsResponse updateAiSettings(
      Authentication authentication,
      @RequestBody(required = false) AdminAiSettingsUpdateRequest request
  ) {
    User admin = requireAdmin(authentication);
    if (request != null) {
      openRouterGlobalSettingsService.updateModels(new AdminOpenRouterModelsUpdateRequest(
        request.openrouterTextModel(),
        request.openrouterVisionModel(),
        request.textModelCheckIntervalMinutes(),
          request.photoModelCheckIntervalMinutes(),
          request.healthChecksEnabled(),
          request.retryCount(),
          request.retryBaseDelayMs(),
          request.retryMaxDelayMs(),
          request.requestTimeoutMs(),
          request.degradedFailureThreshold(),
          request.unavailableFailureThreshold(),
          request.unavailableCooldownMinutes(),
          request.recoveryRecheckIntervalMinutes(),
          request.aiTextCacheEnabled(),
          request.aiTextCacheTtlDays()
      ));
    }
    var result = aiProviderSettingsService.update(request);
    log.warn("Admin AI settings updated: userId={} telegramId={} changedFields={} textProvider={} visionProvider={}",
        admin.getId(), admin.getTelegramId(), result.changedFields(), result.summary().activeTextProvider(), result.summary().activeVisionProvider());
    return toAdminAiSettingsResponse(result.settings(), result.summary());
  }

  @GetMapping("/ai/analytics")
  public AdminAiAnalyticsResponse aiAnalytics(
      Authentication authentication,
      @RequestParam(name = "period", defaultValue = "DAY") String period
  ) {
    User admin = requireAdmin(authentication);
    AiAnalyticsPeriod analyticsPeriod;
    try {
      analyticsPeriod = AiAnalyticsPeriod.valueOf((period == null ? "DAY" : period.trim().toUpperCase()));
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "period должен быть HOUR, DAY, WEEK или MONTH");
    }
    log.info("Admin AI analytics requested: userId={} telegramId={} period={}", admin.getId(), admin.getTelegramId(), analyticsPeriod);
    return aiRequestAnalyticsService.analytics(analyticsPeriod);
  }

  @GetMapping("/activity/logs")
  public List<AdminActivityLogItemResponse> activityLogs(
      Authentication authentication,
      @RequestParam(name = "limit", defaultValue = "50") int limit
  ) {
    User admin = requireAdmin(authentication);
    log.info("Admin activity logs requested: userId={} telegramId={} limit={}", admin.getId(), admin.getTelegramId(), limit);
    return adminInsightsService.activityLogs(limit);
  }

  @GetMapping("/auth/magic-link/logs")
  public List<AdminMagicLinkAuditItemResponse> magicLinkAuditLogs(
      Authentication authentication,
      @RequestParam(name = "limit", defaultValue = "50") int limit
  ) {
    User admin = requireAdmin(authentication);
    log.info("Admin magic-link logs requested: userId={} telegramId={} limit={}", admin.getId(), admin.getTelegramId(), limit);
    return magicLinkAuditService.latest(limit);
  }

  @GetMapping("/openrouter/models")
  public AdminOpenRouterModelsResponse openRouterModels(Authentication authentication) {
    User admin = requireAdmin(authentication);
    var settings = openRouterGlobalSettingsService.getOrCreate();
    var models = openRouterGlobalSettingsService.resolveModels(settings);
    String effectiveTextModel = firstNonBlank(models.chatModel(), openRouterModelCatalogService.resolveDynamicTextFallback(admin));
    String effectivePhotoModel = firstNonBlank(models.photoRecognitionModel(), openRouterModelCatalogService.resolveDynamicPhotoFallback(admin));
    log.info("Admin openrouter models requested: userId={} telegramId={} textModel={} photoModel={}",
        admin.getId(), admin.getTelegramId(), effectiveTextModel, effectivePhotoModel);
    return toAdminOpenRouterModelsResponse(settings, effectiveTextModel, effectivePhotoModel, openRouterGlobalSettingsService.hasApiKey(settings));
  }

  @PutMapping("/openrouter/models")
  public AdminOpenRouterModelsResponse updateOpenRouterModels(
      Authentication authentication,
      @RequestBody(required = false) AdminOpenRouterModelsUpdateRequest request
  ) {
    User admin = requireAdmin(authentication);
    var result = openRouterGlobalSettingsService.updateModels(request);
    String effectiveTextModel = firstNonBlank(result.textModel(), openRouterModelCatalogService.resolveDynamicTextFallback(admin));
    String effectivePhotoModel = firstNonBlank(result.photoModel(), openRouterModelCatalogService.resolveDynamicPhotoFallback(admin));
    log.warn("Admin openrouter models updated: userId={} telegramId={} changedFields={} textModel={} photoModel={} hasApiKey={}",
        admin.getId(),
        admin.getTelegramId(),
        result.changedFields(),
        effectiveTextModel,
        effectivePhotoModel,
        result.hasApiKey());
    return toAdminOpenRouterModelsResponse(result.settings(), effectiveTextModel, effectivePhotoModel, result.hasApiKey());
  }

  @PostMapping("/openrouter/check")
  public AdminOpenRouterAvailabilityCheckResponse checkOpenRouterAvailability(
      Authentication authentication,
      @RequestParam(name = "type", defaultValue = "text") String type
  ) {
    requireAdmin(authentication);
    String normalized = type == null ? "text" : type.trim().toLowerCase();
    if (!"text".equals(normalized) && !"photo".equals(normalized)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "type должен быть text или photo");
    }

    if ("photo".equals(normalized)) {
      var result = openRouterModelAvailabilityCheckService.checkCurrentVisionModel();
      openRouterModelAvailabilityPersistenceService.savePhotoCheck(result);
      return new AdminOpenRouterAvailabilityCheckResponse(
          "photo",
          result.model(),
          result.status().name(),
          result.message(),
          result.checkedAt(),
          result.successfulAt()
      );
    }

    var result = openRouterModelAvailabilityCheckService.checkCurrentTextModel();
    openRouterModelAvailabilityPersistenceService.saveTextCheck(result);
    return new AdminOpenRouterAvailabilityCheckResponse(
        "text",
        result.model(),
        result.status().name(),
        result.message(),
        result.checkedAt(),
        result.successfulAt()
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

  private AdminOpenRouterModelsResponse toAdminOpenRouterModelsResponse(
      com.example.plantbot.domain.GlobalSettings settings,
      String effectiveTextModel,
      String effectivePhotoModel,
      boolean hasApiKey
  ) {
    return new AdminOpenRouterModelsResponse(
        effectiveTextModel,
        effectivePhotoModel,
        hasApiKey,
        Boolean.TRUE.equals(settings.getOpenrouterHealthChecksEnabled()),
        settings.getOpenrouterRetryCount(),
        settings.getOpenrouterRetryBaseDelayMs(),
        settings.getOpenrouterRetryMaxDelayMs(),
        settings.getOpenrouterRequestTimeoutMs(),
        settings.getOpenrouterDegradedFailureThreshold(),
        settings.getOpenrouterUnavailableFailureThreshold(),
        settings.getOpenrouterUnavailableCooldownMinutes(),
        settings.getOpenrouterRecoveryRecheckIntervalMinutes(),
        settings.isAiTextCacheEnabled(),
        settings.getAiTextCacheTtlDays(),
        openRouterGlobalSettingsService.countActiveAiTextCacheEntries(),
        settings.getAiTextCacheLastCleanupAt(),
        settings.getUpdatedAt(),
        settings.getTextModelAvailabilityStatus() == null ? "UNKNOWN" : settings.getTextModelAvailabilityStatus().name(),
        settings.getTextModelLastCheckedAt(),
        settings.getTextModelLastSuccessfulAt(),
        settings.getTextModelLastErrorMessage(),
        settings.getTextModelLastNotifiedUnavailableAt(),
        settings.getTextModelCheckIntervalMinutes(),
        settings.getPhotoModelAvailabilityStatus() == null ? "UNKNOWN" : settings.getPhotoModelAvailabilityStatus().name(),
        settings.getPhotoModelLastCheckedAt(),
        settings.getPhotoModelLastSuccessfulAt(),
        settings.getPhotoModelLastErrorMessage(),
        settings.getPhotoModelLastNotifiedUnavailableAt(),
        settings.getPhotoModelCheckIntervalMinutes()
    );
  }

  private AdminAiSettingsResponse toAdminAiSettingsResponse(
      com.example.plantbot.domain.GlobalSettings settings,
      AiProviderSettingsService.ProviderSettingsSummary summary
  ) {
    return new AdminAiSettingsResponse(
        summary.activeTextProvider().name(),
        summary.activeVisionProvider().name(),
        summary.openrouterTextModel(),
        summary.openrouterVisionModel(),
        summary.openaiCompatibleBaseUrl(),
        summary.openaiCompatibleModelsUrl(),
        summary.openaiCompatibleTextModel(),
        summary.openaiCompatibleVisionModel(),
        summary.effectiveTextModel(),
        summary.effectiveVisionModel(),
        summary.openrouterHasApiKey(),
        summary.openaiCompatibleHasApiKey(),
        openRouterGlobalSettingsService.maskApiKey(openRouterGlobalSettingsService.resolveApiKey(settings)),
        aiProviderSettingsService.maskApiKey(settings, com.example.plantbot.domain.AiProviderType.OPENAI_COMPATIBLE),
        settings.getOpenaiCompatibleRequestTimeoutMs(),
        settings.getOpenaiCompatibleMaxTokens(),
        Boolean.TRUE.equals(settings.getOpenrouterHealthChecksEnabled()),
        settings.getOpenrouterRetryCount(),
        settings.getOpenrouterRetryBaseDelayMs(),
        settings.getOpenrouterRetryMaxDelayMs(),
        settings.getOpenrouterRequestTimeoutMs(),
        settings.getOpenrouterDegradedFailureThreshold(),
        settings.getOpenrouterUnavailableFailureThreshold(),
        settings.getOpenrouterUnavailableCooldownMinutes(),
        settings.getOpenrouterRecoveryRecheckIntervalMinutes(),
        settings.isAiTextCacheEnabled(),
        settings.getAiTextCacheTtlDays(),
        openRouterGlobalSettingsService.countActiveAiTextCacheEntries(),
        settings.getAiTextCacheLastCleanupAt(),
        settings.getUpdatedAt(),
        settings.getTextModelAvailabilityStatus() == null ? "UNKNOWN" : settings.getTextModelAvailabilityStatus().name(),
        settings.getTextModelLastCheckedAt(),
        settings.getTextModelLastSuccessfulAt(),
        settings.getTextModelLastErrorMessage(),
        settings.getTextModelLastNotifiedUnavailableAt(),
        settings.getTextModelCheckIntervalMinutes(),
        settings.getPhotoModelAvailabilityStatus() == null ? "UNKNOWN" : settings.getPhotoModelAvailabilityStatus().name(),
        settings.getPhotoModelLastCheckedAt(),
        settings.getPhotoModelLastSuccessfulAt(),
        settings.getPhotoModelLastErrorMessage(),
        settings.getPhotoModelLastNotifiedUnavailableAt(),
        settings.getPhotoModelCheckIntervalMinutes()
    );
  }

  @PostMapping("/ai/openai-compatible/test")
  public AdminOpenAiCompatibleCapabilityTestResponse testOpenAiCompatible(Authentication authentication,
                                                                          @RequestBody(required = false) AdminOpenAiCompatibleTestRequest request) {
    return testOpenAiCompatibleConnection(authentication, request);
  }

  @PostMapping("/ai/openai-compatible/models")
  public AdminOpenAiCompatibleModelsResponse openAiCompatibleModels(Authentication authentication,
                                                                    @RequestBody(required = false) AdminOpenAiCompatibleModelsRequest request) {
    requireAdmin(authentication);
    var result = openAiCompatibleModelCatalogService.fetchModels(
        request == null ? null : request.baseUrl(),
        request == null ? null : request.modelsUrl(),
        request == null ? null : request.apiKey()
    );
    return new AdminOpenAiCompatibleModelsResponse(result.baseUrl(), result.modelsUrl(), result.message(), result.models());
  }

  @PostMapping("/ai/openai-compatible/test-connection")
  public AdminOpenAiCompatibleCapabilityTestResponse testOpenAiCompatibleConnection(Authentication authentication,
                                                                                    @RequestBody(required = false) AdminOpenAiCompatibleTestRequest request) {
    User admin = requireAdmin(authentication);
    return openAiCompatibleAdminTestService.testConnection(admin, request);
  }

  @PostMapping("/ai/openai-compatible/test-json")
  public AdminOpenAiCompatibleCapabilityTestResponse testOpenAiCompatibleJson(Authentication authentication,
                                                                              @RequestBody(required = false) AdminOpenAiCompatibleTestRequest request) {
    User admin = requireAdmin(authentication);
    return openAiCompatibleAdminTestService.testJson(admin, request);
  }

  @PostMapping("/ai/openai-compatible/test-vision")
  public AdminOpenAiCompatibleCapabilityTestResponse testOpenAiCompatibleVision(Authentication authentication,
                                                                                @RequestBody(required = false) AdminOpenAiCompatibleTestRequest request) {
    User admin = requireAdmin(authentication);
    return openAiCompatibleAdminTestService.testVision(admin, request);
  }

  @PostMapping("/openrouter/test")
  public AdminOpenRouterTestResponse testOpenRouter(
      Authentication authentication,
      @RequestBody(required = false) AdminOpenRouterTestRequest request
  ) {
    User admin = requireAdmin(authentication);
    String message = request == null || request.message() == null || request.message().isBlank()
        ? "Тест глобальной конфигурации OpenRouter: назови одно неприхотливое комнатное растение."
        : request.message().trim();

    var answer = openRouterPlantAdvisorService.answerGardeningQuestion(null, message);
    if (answer.isEmpty()) {
      log.warn("Admin openrouter test failed: userId={} telegramId={} message='{}'",
          admin.getId(), admin.getTelegramId(), message);
      return new AdminOpenRouterTestResponse(
          false,
          null,
          null,
          "Тест не прошёл. Проверьте глобальный API-ключ, модель и лимиты OpenRouter."
      );
    }

    log.info("Admin openrouter test success: userId={} telegramId={} model={}",
        admin.getId(), admin.getTelegramId(), answer.get().model());
    return new AdminOpenRouterTestResponse(
        true,
        answer.get().answer(),
        answer.get().model(),
        "Тест успешен"
    );
  }

  @PostMapping("/clear-cache")
  public AdminCacheClearResponse clearCache(Authentication authentication) {
    User admin = requireAdmin(authentication);
    int lookupRows = plantCatalogService.clearLookupCache();
    OpenRouterPlantAdvisorService.CacheClearStats openRouterStats = openRouterPlantAdvisorService.clearCaches();
    WeatherService.CacheClearStats weatherStats = weatherService.clearCaches();
    log.info("Admin cache clear executed: telegramId={}, lookupRows={}, openRouter={}/{}/{}, weather={}/{}/{}",
        admin.getTelegramId(),
        lookupRows,
        openRouterStats.careAdviceEntries(),
        openRouterStats.wateringProfileEntries(),
        openRouterStats.chatEntries(),
        weatherStats.weatherEntries(),
        weatherStats.rainKeys(),
        weatherStats.rainSamples());
    return new AdminCacheClearResponse(
        lookupRows,
        openRouterStats.careAdviceEntries(),
        openRouterStats.wateringProfileEntries(),
        openRouterStats.chatEntries(),
        weatherStats.weatherEntries(),
        weatherStats.rainKeys(),
        weatherStats.rainSamples()
    );
  }

  @PostMapping("/clear-cache/{scope}")
  public AdminScopedCacheClearResponse clearCacheScope(
      Authentication authentication,
      @PathVariable("scope") String scopeRaw
  ) {
    User admin = requireAdmin(authentication);
    String scope = scopeRaw == null ? "" : scopeRaw.trim().toLowerCase();
    switch (scope) {
      case "weather" -> {
        WeatherService.CacheClearStats weatherStats = weatherService.clearCaches();
        log.info("Admin weather cache clear executed: userId={} telegramId={} weather={}/{}/{}",
            admin.getId(), admin.getTelegramId(), weatherStats.weatherEntries(), weatherStats.rainKeys(), weatherStats.rainSamples());
        return new AdminScopedCacheClearResponse(
            "weather",
            weatherStats.weatherEntries(),
            weatherStats.rainKeys(),
            weatherStats.rainSamples(),
            0,
            0,
            0,
            0,
            0,
            "Кэш погоды очищен"
        );
      }
      case "openrouter" -> {
        OpenRouterPlantAdvisorService.CacheClearStats openRouterStats = openRouterPlantAdvisorService.clearCaches();
        log.info("Admin openrouter cache clear executed: userId={} telegramId={} openRouter={}/{}/{}",
            admin.getId(), admin.getTelegramId(), openRouterStats.careAdviceEntries(), openRouterStats.wateringProfileEntries(), openRouterStats.chatEntries());
        return new AdminScopedCacheClearResponse(
            "openrouter",
            0,
            0,
            0,
            openRouterStats.careAdviceEntries(),
            openRouterStats.wateringProfileEntries(),
            openRouterStats.chatEntries(),
            0,
            0,
            "Кэш OpenRouter очищен"
        );
      }
      case "ai-text" -> {
        int deleted = aiTextCacheService.clearAll();
        openRouterGlobalSettingsService.markAiTextCacheCleanupAt(java.time.Instant.now());
        log.info("Admin AI text cache clear executed: userId={} telegramId={} entries={}",
            admin.getId(), admin.getTelegramId(), deleted);
        return new AdminScopedCacheClearResponse(
            "ai-text",
            0,
            0,
            0,
            0,
            0,
            0,
            deleted,
            0,
            "AI text cache очищен"
        );
      }
      case "ai-text-expired" -> {
        int deleted = aiTextCacheService.cleanupExpiredOrInvalidated();
        openRouterGlobalSettingsService.markAiTextCacheCleanupAt(java.time.Instant.now());
        log.info("Admin AI text cache expired cleanup executed: userId={} telegramId={} entries={}",
            admin.getId(), admin.getTelegramId(), deleted);
        return new AdminScopedCacheClearResponse(
            "ai-text-expired",
            0,
            0,
            0,
            0,
            0,
            0,
            deleted,
            0,
            "Просроченный AI text cache очищен"
        );
      }
      case "users" -> {
        int userCacheEntries = adminRateLimitInterceptor.clearTrackedClients();
        log.info("Admin user cache clear executed: userId={} telegramId={} entries={}",
            admin.getId(), admin.getTelegramId(), userCacheEntries);
        return new AdminScopedCacheClearResponse(
            "users",
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            userCacheEntries,
            "Пользовательский кэш очищен"
        );
      }
      default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Неподдерживаемый scope: " + scopeRaw);
    }
  }

  @GetMapping("/backups")
  public List<AdminBackupItemResponse> backups(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin backup list requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return databaseBackupScheduler.listBackups();
  }

  @PostMapping({"/backups/create", "/backup/create"})
  public AdminBackupItemResponse createBackupNow(Authentication authentication) {
    User admin = requireAdmin(authentication);
    String actorTag = "admin-" + admin.getId();
    AdminBackupItemResponse created = databaseBackupScheduler.createBackupNow(actorTag);
    log.warn("Admin backup created: userId={} telegramId={} file={}", admin.getId(), admin.getTelegramId(), created.fileName());
    return created;
  }

  @PostMapping("/backups/{fileName}/restore")
  public AdminBackupRestoreResponse restoreBackup(
      Authentication authentication,
      @PathVariable("fileName") String fileName
  ) {
    User admin = requireAdmin(authentication);
    databaseBackupScheduler.restoreFromBackup(fileName);
    log.warn("Admin restore backup executed: userId={} telegramId={} backup={}", admin.getId(), admin.getTelegramId(), fileName);
    return new AdminBackupRestoreResponse(true, fileName, "База данных восстановлена из backup");
  }

  @PostMapping("/push/test")
  public AdminPushTestResponse sendPushTest(
      Authentication authentication,
      @RequestBody AdminPushTestRequest request
  ) {
    User admin = requireAdmin(authentication);
    if (request == null || request.userId() == null || request.userId() <= 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "userId обязателен");
    }
    User user = userRepository.findById(request.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    WebPushNotificationService.SendResult result = webPushNotificationService.sendTestNotification(user, request.title(), request.body());
    log.info("Admin push test executed: adminId={} adminTelegramId={} targetUserId={} subscriptions={} delivered={}",
        admin.getId(), admin.getTelegramId(), user.getId(), result.subscriptions(), result.delivered());
    return new AdminPushTestResponse(
        result.delivered() > 0,
        user.getId(),
        user.getUsername(),
        result.subscriptions(),
        result.delivered(),
        result.message(),
        result.endpoints().stream()
            .map(item -> new AdminPushTestResponse.AdminPushEndpointResultResponse(
                item.endpoint(),
                item.delivered(),
                item.status(),
                item.error()
            ))
            .toList()
    );
  }

  @GetMapping("/plants")
  public AdminPlantsResponse plants(
      Authentication authentication,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "q", required = false) String q
  ) {
    User admin = requireAdmin(authentication);
    log.info("Admin plants requested: userId={} telegramId={} page={} size={} q={}", admin.getId(), admin.getTelegramId(), page, size, q);
    return adminService.plants(page, size, q);
  }

  @PostMapping("/plants/{plantId}/water")
  public AdminPlantActionResponse waterPlant(
      Authentication authentication,
      @PathVariable("plantId") Long plantId
  ) {
    User admin = requireAdmin(authentication);
    var plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    boolean updated = adminService.waterPlantNow(plant);
    log.info("Admin plant water action: adminUserId={} adminTelegramId={} plantId={} updated={}",
        admin.getId(), admin.getTelegramId(), plantId, updated);
    return new AdminPlantActionResponse(true, plantId, updated ? "Полив отмечен" : "Растение не просрочено");
  }

  @PostMapping("/plants/water-overdue")
  public AdminBulkPlantWaterResponse waterOverduePlants(
      Authentication authentication,
      @RequestBody(required = false) AdminBulkPlantWaterRequest request
  ) {
    User admin = requireAdmin(authentication);
    AdminBulkPlantWaterResponse response = adminService.waterOverduePlants(request == null ? null : request.plantIds());
    log.info("Admin bulk overdue watering: adminUserId={} adminTelegramId={} total={} updated={} skipped={}",
        admin.getId(), admin.getTelegramId(), response.total(), response.updated(), response.skipped());
    return response;
  }

  @DeleteMapping("/plants/{plantId}")
  public AdminPlantActionResponse deletePlant(
      Authentication authentication,
      @PathVariable("plantId") Long plantId
  ) {
    User admin = requireAdmin(authentication);
    var plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    adminService.deletePlant(plant);
    log.warn("Admin plant deleted: adminUserId={} adminTelegramId={} plantId={}",
        admin.getId(), admin.getTelegramId(), plantId);
    return new AdminPlantActionResponse(true, plantId, "Растение удалено");
  }

  @PatchMapping("/plants/{plantId}")
  public AdminPlantItemResponse updatePlant(
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestBody AdminPlantUpdateRequest request
  ) {
    User admin = requireAdmin(authentication);
    var plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    AdminPlantItemResponse response = adminService.updatePlant(plant, request);
    log.info("Admin plant updated: adminUserId={} adminTelegramId={} plantId={}",
        admin.getId(), admin.getTelegramId(), plantId);
    return response;
  }

  @GetMapping("/dictionary/merge-tasks")
  public List<AdminMergeTaskItemResponse> mergeTasks(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin merge tasks requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return adminService.mergeTasks();
  }

  @PostMapping("/dictionary/merge-tasks/{taskId}/retry")
  public AdminMergeTaskRetryResponse retryMergeTask(
      Authentication authentication,
      @PathVariable("taskId") Long taskId
  ) {
    User admin = requireAdmin(authentication);
    adminService.retryMergeTask(taskId);
    log.warn("Admin merge task retry requested: userId={} telegramId={} taskId={}", admin.getId(), admin.getTelegramId(), taskId);
    return new AdminMergeTaskRetryResponse(true, taskId, "Задача помечена на повторную обработку");
  }

  private User requireAdmin(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof PwaPrincipal principal)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется JWT авторизация");
    }
    User user = userRepository.findById(principal.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
    // Fallback: если у пользователя совпадает telegramId из конфига,
    // автоматически выдаём и сохраняем ROLE_ADMIN.
    if (adminTelegramId != null
        && adminTelegramId > 0
        && adminTelegramId.equals(user.getTelegramId())
        && (user.getRoles() == null || !user.getRoles().contains(UserRole.ROLE_ADMIN))) {
      if (user.getRoles() == null) {
        user.setRoles(new java.util.HashSet<>());
      }
      user.getRoles().add(UserRole.ROLE_ADMIN);
      user = userRepository.save(user);
      log.warn("Admin role auto-granted by configured telegramId: userId={} telegramId={}",
          user.getId(), user.getTelegramId());
    }
    if (user.getRoles() == null || !user.getRoles().contains(UserRole.ROLE_ADMIN)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Недостаточно прав");
    }
    if (Boolean.TRUE.equals(user.getBlocked())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован");
    }
    return user;
  }
}
