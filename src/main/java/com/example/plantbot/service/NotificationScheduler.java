package com.example.plantbot.service;

import com.example.plantbot.bot.PlantTelegramBot;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationScheduler {
  private final PlantRepository plantRepository;
  private final WateringRecommendationService recommendationService;
  private final PlantTelegramBot bot;

  @Value("${scheduler.daily-cron}")
  private String cron;

  @Scheduled(cron = "${scheduler.daily-cron}")
  public void dailyCheck() {
    LocalDate today = LocalDate.now();
    List<Plant> plants = plantRepository.findAll();
    for (Plant plant : plants) {
      WateringRecommendation rec = recommendationService.recommend(plant, plant.getUser().getCity());
      LocalDate dueDate = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      boolean due = !today.isBefore(dueDate);
      boolean alreadyRemindedToday = today.equals(plant.getLastReminderDate());
      if (due && !alreadyRemindedToday) {
        boolean sent = bot.sendWateringReminder(plant, rec);
        if (sent) {
          plant.setLastReminderDate(today);
          plantRepository.save(plant);
        }
      }
    }
  }
}
