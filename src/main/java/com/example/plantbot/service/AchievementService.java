package com.example.plantbot.service;

import com.example.plantbot.controller.dto.AchievementItemResponse;
import com.example.plantbot.controller.dto.AchievementsResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AchievementService {
  private final PlantService plantService;
  private final WateringLogService wateringLogService;

  public AchievementsResponse build(User user) {
    List<Plant> plants = plantService.list(user);
    int plantCount = plants.size();
    int outdoorCount = (int) plants.stream().filter(p -> p.getPlacement() == PlantPlacement.OUTDOOR).count();
    int photosCount = (int) plants.stream().filter(p -> p.getPhotoUrl() != null && !p.getPhotoUrl().isBlank()).count();
    int aiDetectedCount = (int) plants.stream()
        .filter(p -> p.getLookupSource() != null && p.getLookupSource().toLowerCase().contains("openrouter"))
        .count();

    int totalWaterings = plants.stream().mapToInt(p -> (int) wateringLogService.countAll(p)).sum();

    List<AchievementItemResponse> items = new ArrayList<>();
    items.add(item("first_plant", "Первый росток", "Добавьте первое растение", "Sprout", plantCount, 1));
    items.add(item("home_jungle", "Домашние джунгли", "Добавьте 5 растений", "Trees", plantCount, 5));
    items.add(item("watering_10", "Режим полива", "Отметьте 10 поливов", "Droplets", totalWaterings, 10));
    items.add(item("watering_50", "Мастер полива", "Отметьте 50 поливов", "Droplet", totalWaterings, 50));
    items.add(item("outdoor_start", "Садовод", "Добавьте уличное растение", "Sun", outdoorCount, 1));
    items.add(item("growth_memory", "Дневник роста", "Добавьте 3 фото растений", "Camera", photosCount, 3));
    items.add(item("ai_friend", "AI-ботаник", "Распознайте 3 растения через AI", "Sparkles", aiDetectedCount, 3));

    int unlocked = (int) items.stream().filter(AchievementItemResponse::unlocked).count();
    return new AchievementsResponse(unlocked, items.size(), items);
  }

  private AchievementItemResponse item(String key, String title, String description, String icon, int progress, int target) {
    int safeProgress = Math.max(0, Math.min(progress, target));
    return new AchievementItemResponse(key, title, description, icon, safeProgress, target, progress >= target);
  }
}
