package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminUserDetailsResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskItemResponse;
import com.example.plantbot.controller.dto.admin.AdminBulkPlantWaterResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsItemResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUserItemResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantUpdateRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import com.example.plantbot.repository.AuthIdentityRepository;
import com.example.plantbot.repository.AssistantChatHistoryRepository;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.repository.WateringLogRepository;
import com.example.plantbot.repository.WebPushSubscriptionRepository;
import com.example.plantbot.repository.ha.HomeAssistantConnectionRepository;
import com.example.plantbot.repository.ha.PlantAdjustmentLogRepository;
import com.example.plantbot.repository.ha.PlantConditionSampleRepository;
import com.example.plantbot.repository.ha.PlantHomeAssistantBindingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminService {
  private final UserRepository userRepository;
  private final PlantRepository plantRepository;
  private final WateringLogRepository wateringLogRepository;
  private final PlantDuplicateMergeProcessor plantDuplicateMergeProcessor;
  private final HomeAssistantConnectionRepository homeAssistantConnectionRepository;
  private final PlantHomeAssistantBindingRepository plantHomeAssistantBindingRepository;
  private final PlantConditionSampleRepository plantConditionSampleRepository;
  private final PlantAdjustmentLogRepository plantAdjustmentLogRepository;
  private final WebPushSubscriptionRepository webPushSubscriptionRepository;
  private final AuthIdentityRepository authIdentityRepository;
  private final AssistantChatHistoryRepository assistantChatHistoryRepository;
  private final WateringLogService wateringLogService;

  public AdminOverviewResponse overview() {
    long totalUsers = userRepository.count();
    long totalPlants = plantRepository.count();
    long usersWithPlants = plantRepository.countDistinctUsersWithPlants();
    long indoorPlants = plantRepository.countByPlacement(PlantPlacement.INDOOR);
    long outdoorPlants = plantRepository.countByPlacement(PlantPlacement.OUTDOOR);
    long activeUsers7d = wateringLogRepository.countDistinctUsersActiveSince(LocalDate.now().minusDays(7));
    long activeUsers30d = wateringLogRepository.countDistinctUsersActiveSince(LocalDate.now().minusDays(30));

    return new AdminOverviewResponse(totalUsers, totalPlants, usersWithPlants, indoorPlants, outdoorPlants, activeUsers7d, activeUsers30d);
  }

  public AdminUsersResponse users(int page, int size, String q) {
    int safePage = Math.max(0, page);
    int safeSize = Math.min(100, Math.max(1, size));
    String query = normalizeQuery(q);

    var pageData = userRepository.searchUsers(
        query,
        PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"))
    );

    List<Long> userIds = pageData.getContent().stream().map(User::getId).toList();
    Map<Long, Long> plantCountByUserId = userIds.isEmpty()
        ? Collections.emptyMap()
        : plantRepository.countPlantsByUserIds(userIds).stream()
            .collect(Collectors.toMap(
                row -> (Long) row[0],
                row -> (Long) row[1]
            ));

    List<AdminUserItemResponse> items = pageData.getContent().stream()
        .map(user -> new AdminUserItemResponse(
            user.getId(),
            user.getTelegramId(),
            user.getUsername(),
            user.getFirstName(),
            user.getEmail(),
            user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(),
            user.getCreatedAt(),
            resolveLastSeen(user),
            Boolean.TRUE.equals(user.getBlocked()),
            plantCountByUserId.getOrDefault(user.getId(), 0L)
        ))
        .toList();

    return new AdminUsersResponse(items, safePage, safeSize, pageData.getTotalElements());
  }

  public List<AdminPlantItemResponse> userPlants(User user) {
    return plantRepository.findByUser(user).stream()
        .sorted((a, b) -> {
          if (a.getCreatedAt() == null && b.getCreatedAt() == null) {
            return 0;
          }
          if (a.getCreatedAt() == null) {
            return 1;
          }
          if (b.getCreatedAt() == null) {
            return -1;
          }
          return b.getCreatedAt().compareTo(a.getCreatedAt());
        })
        .map(this::toPlantItem)
        .toList();
  }

  @Transactional(readOnly = true)
  public AdminUserDetailsResponse userDetails(User user) {
    List<Plant> plants = plantRepository.findByUser(user);
    List<AdminPlantItemResponse> plantItems = plants.stream()
        .sorted((a, b) -> {
          if (a.getCreatedAt() == null && b.getCreatedAt() == null) {
            return 0;
          }
          if (a.getCreatedAt() == null) {
            return 1;
          }
          if (b.getCreatedAt() == null) {
            return -1;
          }
          return b.getCreatedAt().compareTo(a.getCreatedAt());
        })
        .map(this::toPlantItem)
        .toList();

    long overduePlants = plants.stream().filter(this::isOverdue).count();
    long totalWaterings = plants.isEmpty() ? 0 : wateringLogRepository.countByPlantIn(plants);

    HomeAssistantConnection connection = homeAssistantConnectionRepository.findByUser(user).orElse(null);

    return new AdminUserDetailsResponse(
        user.getId(),
        user.getTelegramId(),
        user.getUsername(),
        user.getFirstName(),
        user.getLastName(),
        user.getEmail(),
        user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(),
        Boolean.TRUE.equals(user.getBlocked()),
        user.getCreatedAt(),
        resolveLastSeen(user),
        user.getLastSeenPwaAt(),
        user.getLastSeenTmaAt(),
        plants.size(),
        overduePlants,
        totalWaterings,
        connection != null && connection.isConnected(),
        connection == null ? null : connection.getInstanceName(),
        connection == null ? null : maskUrl(connection.getBaseUrl()),
        connection == null ? null : connection.getLastSuccessAt(),
        user.getOpenrouterApiKeyEncrypted() != null && !user.getOpenrouterApiKeyEncrypted().isBlank(),
        user.getOpenrouterModelPlant(),
        user.getOpenrouterModelChat(),
        user.getOpenrouterModelPhotoIdentify(),
        user.getOpenrouterModelPhotoDiagnose(),
        plantItems
    );
  }

  @Transactional
  public boolean setBlocked(User actor, User target, Boolean blocked) {
    ensureUserCanBeMutated(actor, target, "блокировать");
    boolean newState = blocked == null ? !Boolean.TRUE.equals(target.getBlocked()) : blocked;
    target.setBlocked(newState);
    userRepository.save(target);
    return newState;
  }

  @Transactional
  public void deleteUser(User actor, User target) {
    ensureUserCanBeMutated(actor, target, "удалять");

    List<Plant> plants = plantRepository.findByUser(target);
    if (!plants.isEmpty()) {
      plantHomeAssistantBindingRepository.deleteByPlantIn(plants);
      plantConditionSampleRepository.deleteByPlantIn(plants);
      plantAdjustmentLogRepository.deleteByPlantIn(plants);
      wateringLogRepository.deleteByPlantIn(plants);
      plantRepository.deleteAllInBatch(plants);
    }

    homeAssistantConnectionRepository.deleteByUser(target);
    webPushSubscriptionRepository.deleteByUser(target);
    assistantChatHistoryRepository.deleteByUser(target);
    authIdentityRepository.deleteByUser(target);
    userRepository.delete(target);
  }

  @Transactional
  public boolean waterPlantNow(Plant plant) {
    if (!isOverdue(plant)) {
      return false;
    }
    LocalDate today = LocalDate.now();
    plant.setLastWateredDate(today);
    plant.setLastReminderDate(null);
    plantRepository.save(plant);
    wateringLogService.addLog(plant, today, null, null, null, null);
    return true;
  }

  @Transactional
  public AdminBulkPlantWaterResponse waterOverduePlants(List<Long> requestedPlantIds) {
    List<Plant> candidates;
    if (requestedPlantIds == null || requestedPlantIds.isEmpty()) {
      candidates = plantRepository.findAll();
    } else {
      candidates = plantRepository.findAllById(requestedPlantIds);
    }

    int updated = 0;
    for (Plant plant : candidates) {
      if (waterPlantNow(plant)) {
        updated++;
      }
    }
    int total = candidates.size();
    int skipped = Math.max(0, total - updated);
    String message = updated > 0
        ? "Полив отмечен для " + updated + " растений"
        : "Нет просроченных растений для отметки";
    return new AdminBulkPlantWaterResponse(true, total, updated, skipped, message);
  }

  @Transactional
  public void deletePlant(Plant plant) {
    List<Plant> single = List.of(plant);
    plantHomeAssistantBindingRepository.deleteByPlantIn(single);
    plantConditionSampleRepository.deleteByPlantIn(single);
    plantAdjustmentLogRepository.deleteByPlantIn(single);
    wateringLogRepository.deleteByPlantIn(single);
    plantRepository.delete(plant);
  }

  @Transactional
  public AdminPlantItemResponse updatePlant(Plant plant, AdminPlantUpdateRequest request) {
    if (request == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Пустой payload обновления");
    }
    if (request.name() != null) {
      String normalized = request.name().trim();
      if (normalized.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Название растения не может быть пустым");
      }
      plant.setName(normalized);
    }
    if (request.baseIntervalDays() != null) {
      int interval = request.baseIntervalDays();
      if (interval < 1 || interval > 180) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Интервал полива должен быть в диапазоне 1..180");
      }
      plant.setBaseIntervalDays(interval);
    }
    if (request.category() != null) {
      plant.setCategory(request.category());
    }
    Plant saved = plantRepository.save(plant);
    return toPlantItem(saved);
  }

  public AdminPlantsResponse plants(int page, int size, String q) {
    int safePage = Math.max(0, page);
    int safeSize = Math.min(100, Math.max(1, size));
    String query = normalizeQuery(q);
    var pageData = plantRepository.searchPlants(
        query,
        PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"))
    );

    List<AdminPlantItemResponse> items = pageData.getContent().stream().map(this::toPlantItem).toList();
    return new AdminPlantsResponse(items, safePage, safeSize, pageData.getTotalElements());
  }

  public AdminStatsResponse stats() {
    List<AdminStatsItemResponse> topCities = userRepository.topCities(PageRequest.of(0, 10)).stream()
        .map(row -> new AdminStatsItemResponse(String.valueOf(row[0]), ((Number) row[1]).longValue()))
        .toList();

    List<AdminStatsItemResponse> topPlantTypes = plantRepository.countByPlantType(PageRequest.of(0, 10)).stream()
        .map(row -> new AdminStatsItemResponse(String.valueOf(row[0]), ((Number) row[1]).longValue()))
        .toList();

    long overduePlants = plantRepository.countOverduePlants(LocalDate.now());
    long activeUsers7d = wateringLogRepository.countDistinctUsersActiveSince(LocalDate.now().minusDays(7));
    long activeUsers30d = wateringLogRepository.countDistinctUsersActiveSince(LocalDate.now().minusDays(30));
    return new AdminStatsResponse(topCities, topPlantTypes, overduePlants, activeUsers7d, activeUsers30d);
  }

  public List<AdminMergeTaskItemResponse> mergeTasks() {
    return plantDuplicateMergeProcessor.latestTasks().stream()
        .map(task -> new AdminMergeTaskItemResponse(
            task.getId(),
            task.getCategory(),
            task.getLeftName(),
            task.getRightName(),
            task.getStatus(),
            task.getAttemptCount(),
            task.getNextAttemptAt(),
            task.getLastError(),
            task.getUpdatedAt()
        ))
        .toList();
  }

  public void retryMergeTask(Long taskId) {
    plantDuplicateMergeProcessor.markForRetry(taskId);
  }

  public AdminPlantItemResponse toPlantItem(Plant plant) {
    User user = plant.getUser();
    LocalDate next = plant.getLastWateredDate() == null
        ? null
        : plant.getLastWateredDate().plusDays(Math.max(1, plant.getBaseIntervalDays()));
    return new AdminPlantItemResponse(
        plant.getId(),
        plant.getName(),
        user == null ? null : user.getId(),
        user == null ? null : user.getTelegramId(),
        user == null ? null : user.getUsername(),
        plant.getCategory(),
        plant.getPlacement(),
        plant.getType(),
        plant.getPhotoUrl() != null && !plant.getPhotoUrl().isBlank(),
        plant.getBaseIntervalDays(),
        plant.getLastWateredDate(),
        next,
        plant.getCreatedAt()
    );
  }

  private void ensureUserCanBeMutated(User actor, User target, String operation) {
    if (target.getId().equals(actor.getId())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Нельзя " + operation + " самого себя");
    }
    if (target.getRoles() != null && target.getRoles().contains(UserRole.ROLE_ADMIN)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Нельзя " + operation + " администратора");
    }
  }

  private Instant resolveLastSeen(User user) {
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

  private boolean isOverdue(Plant plant) {
    if (plant.getLastWateredDate() == null) {
      return false;
    }
    LocalDate nextWatering = plant.getLastWateredDate().plusDays(Math.max(1, plant.getBaseIntervalDays()));
    return nextWatering.isBefore(LocalDate.now());
  }

  private String maskUrl(String baseUrl) {
    if (baseUrl == null || baseUrl.isBlank()) {
      return null;
    }
    String trimmed = baseUrl.trim();
    if (trimmed.length() <= 12) {
      return trimmed;
    }
    return trimmed.substring(0, 10) + "…";
  }

  private String normalizeQuery(String q) {
    if (q == null) {
      return "";
    }
    return q.trim().toLowerCase(Locale.ROOT);
  }
}
