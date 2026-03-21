package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminNotificationService {
  private final UserRepository userRepository;
  private final WebPushNotificationService webPushNotificationService;

  @Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  public void notifyAdmin(String title, String body) {
    if (adminTelegramId == null || adminTelegramId <= 0) {
      return;
    }

    userRepository.findByTelegramId(adminTelegramId).ifPresent(admin -> {
      try {
        WebPushNotificationService.SendResult result = webPushNotificationService.sendTestNotification(admin, title, body);
        log.info("Admin notification via web push: subscriptions={} delivered={} title='{}'",
            result.subscriptions(), result.delivered(), title);
      } catch (Exception ex) {
        log.warn("Admin push notification failed: {}", ex.getMessage());
      }
    });
  }

  private String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
