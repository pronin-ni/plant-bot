package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminCacheClearResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import com.example.plantbot.service.AdminService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.WeatherService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

  private User requireAdmin(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof PwaPrincipal principal)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется JWT авторизация");
    }
    return userRepository.findById(principal.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
  }
}
