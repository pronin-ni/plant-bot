package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminOverviewResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantItemResponse;
import com.example.plantbot.controller.dto.admin.AdminPlantsResponse;
import com.example.plantbot.controller.dto.admin.AdminMergeTaskItemResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsItemResponse;
import com.example.plantbot.controller.dto.admin.AdminStatsResponse;
import com.example.plantbot.controller.dto.admin.AdminUserItemResponse;
import com.example.plantbot.controller.dto.admin.AdminUsersResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.repository.WateringLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

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
            user.getCityDisplayName() == null ? user.getCity() : user.getCityDisplayName(),
            user.getCreatedAt(),
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
        plant.getPlacement(),
        plant.getType(),
        plant.getBaseIntervalDays(),
        plant.getLastWateredDate(),
        next,
        plant.getCreatedAt()
    );
  }

  private String normalizeQuery(String q) {
    if (q == null) {
      return "";
    }
    return q.trim().toLowerCase(Locale.ROOT);
  }
}
