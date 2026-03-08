package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminBackupItemResponse;
import com.example.plantbot.controller.dto.admin.AdminBackupRestoreResponse;
import com.example.plantbot.controller.dto.admin.AdminCacheClearResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskItemResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskRetryResponse;
import com.example.plantbot.controller.dto.admin.AdminPushTestRequest;
import com.example.plantbot.controller.dto.admin.AdminPushTestResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import com.example.plantbot.service.AdminService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.service.DatabaseBackupScheduler;
import com.example.plantbot.service.WebPushNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
  private final DatabaseBackupScheduler databaseBackupScheduler;
  private final WebPushNotificationService webPushNotificationService;

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

  @GetMapping("/backups")
  public List<AdminBackupItemResponse> backups(Authentication authentication) {
    User admin = requireAdmin(authentication);
    log.info("Admin backup list requested: userId={} telegramId={}", admin.getId(), admin.getTelegramId());
    return databaseBackupScheduler.listBackups();
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
        result.message()
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
    return userRepository.findById(principal.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
  }
}
