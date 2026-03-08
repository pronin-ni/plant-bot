package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminActivityLogItemResponse;
import com.example.plantbot.controller.dto.admin.AdminMonitoringResponse;
import com.example.plantbot.domain.AssistantChatHistory;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WateringLog;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import com.example.plantbot.repository.AssistantChatHistoryRepository;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.repository.WateringLogRepository;
import com.example.plantbot.repository.WebPushSubscriptionRepository;
import com.example.plantbot.repository.ha.HomeAssistantConnectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminInsightsService {
  private final PlantRepository plantRepository;
  private final HomeAssistantConnectionRepository homeAssistantConnectionRepository;
  private final AssistantChatHistoryRepository assistantChatHistoryRepository;
  private final WateringLogRepository wateringLogRepository;
  private final UserRepository userRepository;
  private final WebPushSubscriptionRepository webPushSubscriptionRepository;

  @Transactional(readOnly = true)
  public List<AdminActivityLogItemResponse> activityLogs(int limit) {
    int safeLimit = Math.max(1, Math.min(200, limit));
    List<AdminActivityLogItemResponse> all = new ArrayList<>();

    for (Plant plant : plantRepository.findTop50ByOrderByCreatedAtDesc()) {
      User user = plant.getUser();
      all.add(new AdminActivityLogItemResponse(
          plant.getCreatedAt(),
          "PLANT_CREATED",
          user == null ? null : user.getId(),
          user == null ? null : user.getTelegramId(),
          user == null ? null : user.getUsername(),
          "Добавлено растение: " + plant.getName(),
          "info"
      ));
    }

    for (HomeAssistantConnection connection : homeAssistantConnectionRepository.findTop50ByOrderByUpdatedAtDesc()) {
      User user = connection.getUser();
      all.add(new AdminActivityLogItemResponse(
          connection.getUpdatedAt(),
          connection.isConnected() ? "HA_CONNECTED" : "HA_DISCONNECTED",
          user == null ? null : user.getId(),
          user == null ? null : user.getTelegramId(),
          user == null ? null : user.getUsername(),
          connection.isConnected() ? "Подключён Home Assistant" : "Отключён Home Assistant",
          connection.isConnected() ? "info" : "warning"
      ));
    }

    for (AssistantChatHistory chat : assistantChatHistoryRepository.findTop50ByOrderByCreatedAtDesc()) {
      User user = chat.getUser();
      all.add(new AdminActivityLogItemResponse(
          chat.getCreatedAt(),
          "AI_QUESTION",
          user == null ? null : user.getId(),
          user == null ? null : user.getTelegramId(),
          user == null ? null : user.getUsername(),
          "Вопрос к AI: " + truncate(chat.getQuestion(), 90),
          "info"
      ));
    }

    for (WateringLog log : wateringLogRepository.findTop50ByOrderByCreatedAtDesc()) {
      Plant plant = log.getPlant();
      User user = plant == null ? null : plant.getUser();
      all.add(new AdminActivityLogItemResponse(
          log.getCreatedAt(),
          "WATERING",
          user == null ? null : user.getId(),
          user == null ? null : user.getTelegramId(),
          user == null ? null : user.getUsername(),
          "Отмечен полив: " + (plant == null ? "—" : plant.getName()),
          "info"
      ));
    }

    return all.stream()
        .filter(item -> item.at() != null)
        .sorted(Comparator.comparing(AdminActivityLogItemResponse::at).reversed())
        .limit(safeLimit)
        .toList();
  }

  @Transactional(readOnly = true)
  public AdminMonitoringResponse monitoring() {
    Instant now = Instant.now();
    Instant onlineFrom = now.minus(Duration.ofMinutes(15));
    Instant active24hFrom = now.minus(Duration.ofHours(24));
    Instant dayFrom = now.minus(Duration.ofHours(24));

    long onlineUsers = userRepository.countOnlineSince(onlineFrom);
    List<User> activeUsers = userRepository.findActiveSince(active24hFrom);
    long activeUsers24h = activeUsers.size();

    double avgSessionMinutes = activeUsers.stream()
        .mapToDouble(user -> estimateSessionMinutes(user, now))
        .average()
        .orElse(0.0);
    avgSessionMinutes = Math.round(avgSessionMinutes * 10.0) / 10.0;

    long pushFailuresToday = webPushSubscriptionRepository.countByLastFailureAtAfter(dayFrom);
    long errorsToday = pushFailuresToday;

    return new AdminMonitoringResponse(
        onlineUsers,
        activeUsers24h,
        avgSessionMinutes,
        errorsToday,
        pushFailuresToday
    );
  }

  private double estimateSessionMinutes(User user, Instant now) {
    Instant latest = latestSeen(user);
    if (latest == null) {
      return 0.0;
    }
    long minutes = Duration.between(latest, now).toMinutes();
    if (minutes < 0) {
      return 0.0;
    }
    return Math.min(30.0, minutes + 1.0);
  }

  private Instant latestSeen(User user) {
    Instant pwa = user.getLastSeenPwaAt();
    Instant tma = user.getLastSeenTmaAt();
    if (pwa == null) {
      return tma;
    }
    if (tma == null) {
      return pwa;
    }
    return pwa.isAfter(tma) ? pwa : tma;
  }

  private String truncate(String text, int max) {
    if (text == null) {
      return "";
    }
    String trimmed = text.trim();
    if (trimmed.length() <= max) {
      return trimmed;
    }
    return trimmed.substring(0, Math.max(0, max - 1)) + "…";
  }
}
