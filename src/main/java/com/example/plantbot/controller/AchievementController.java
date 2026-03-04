package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.AchievementsResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.AchievementService;
import com.example.plantbot.service.TelegramInitDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/achievements")
@RequiredArgsConstructor
public class AchievementController {
  private final TelegramInitDataService telegramInitDataService;
  private final AchievementService achievementService;

  @GetMapping
  public AchievementsResponse get(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return achievementService.build(user);
  }

  @PostMapping("/check")
  public AchievementsResponse check(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return achievementService.build(user);
  }
}
