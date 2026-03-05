package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.AdminService;
import com.example.plantbot.service.TelegramInitDataService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Slf4j
public class AdminController {
  private final TelegramInitDataService telegramInitDataService;
  private final UserRepository userRepository;
  private final AdminService adminService;

  @org.springframework.beans.factory.annotation.Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @GetMapping("/overview")
  public AdminOverviewResponse overview(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User admin = requireAdmin(initData);
    log.info("Admin overview requested: telegramId={}", admin.getTelegramId());
    return adminService.overview();
  }

  @GetMapping("/users")
  public AdminUsersResponse users(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "q", required = false) String q
  ) {
    User admin = requireAdmin(initData);
    log.info("Admin users requested: telegramId={} page={} size={} q={}", admin.getTelegramId(), page, size, q);
    return adminService.users(page, size, q);
  }

  @GetMapping("/users/{userId}/plants")
  public List<AdminPlantItemResponse> userPlants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @PathVariable("userId") Long userId
  ) {
    User admin = requireAdmin(initData);
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    log.info("Admin user plants requested: adminTelegramId={} targetUserId={}", admin.getTelegramId(), userId);
    return adminService.userPlants(user);
  }

  @GetMapping("/stats")
  public AdminStatsResponse stats(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User admin = requireAdmin(initData);
    log.info("Admin stats requested: telegramId={}", admin.getTelegramId());
    return adminService.stats();
  }

  @GetMapping("/plants")
  public AdminPlantsResponse plants(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size,
      @RequestParam(name = "q", required = false) String q
  ) {
    User admin = requireAdmin(initData);
    log.info("Admin plants requested: telegramId={} page={} size={} q={}", admin.getTelegramId(), page, size, q);
    return adminService.plants(page, size, q);
  }

  private User requireAdmin(String initData) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    if (adminTelegramId == null || adminTelegramId <= 0 || !adminTelegramId.equals(user.getTelegramId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Доступ только для администратора");
    }
    return user;
  }
}
