package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationScheduler {
  private final PlantRepository plantRepository;
  private final WateringRecommendationService recommendationService;
  private final WebPushNotificationService webPushNotificationService;

  @Scheduled(cron = "${scheduler.daily-cron}")
  public void dailyCheck() {
    LocalDate today = LocalDate.now();
    List<Plant> plants = plantRepository.findAll();
    for (Plant plant : plants) {
      User user = plant.getUser();
      WateringRecommendation rec = recommendationService.recommend(plant, user);
      if (rec.waterLiters() <= 0.0) {
        continue;
      }
      LocalDate dueDate = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      boolean due = !today.isBefore(dueDate);
      boolean alreadyRemindedToday = today.equals(plant.getLastReminderDate());
      if (due && !alreadyRemindedToday) {
        boolean webPushSent = webPushNotificationService.sendWateringReminder(plant, rec);
        if (!webPushSent) {
          log.info("Reminder not delivered: plantId={} userId={} webPushEnabled={} pushSubscriptions={}",
              plant.getId(),
              user != null ? user.getId() : null,
              webPushNotificationService.isEnabled(),
              user != null ? webPushNotificationService.countSubscriptions(user) : 0);
        }
        if (webPushSent) {
          plant.setLastReminderDate(today);
          plantRepository.save(plant);
        }
      }
    }
  }
}
