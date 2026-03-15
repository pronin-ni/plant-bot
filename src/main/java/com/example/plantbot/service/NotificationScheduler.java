package com.example.plantbot.service;

import com.example.plantbot.bot.PlantTelegramBot;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationScheduler {
  private static final long PSEUDO_TELEGRAM_ID_MIN = 900_000_000_000L;

  private final PlantRepository plantRepository;
  private final WateringRecommendationService recommendationService;
  private final ObjectProvider<PlantTelegramBot> botProvider;
  private final WebPushNotificationService webPushNotificationService;

  @Value("${scheduler.daily-cron}")
  private String cron;

  @Value("${app.dev-auth-enabled:false}")
  private boolean devAuthEnabled;

  @Value("${app.dev-telegram-id:999000111}")
  private long devTelegramId;

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
        PlantTelegramBot bot = botProvider.getIfAvailable();
        boolean telegramSent = bot != null && shouldUseTelegram(user) && bot.sendWateringReminder(plant, rec);
        boolean webPushSent = webPushNotificationService.sendWateringReminder(plant, rec);
        if (!telegramSent && !webPushSent) {
          log.info("Reminder not delivered: plantId={} userId={} telegramEligible={} webPushEnabled={} pushSubscriptions={}",
              plant.getId(),
              user != null ? user.getId() : null,
              shouldUseTelegram(user),
              webPushNotificationService.isEnabled(),
              user != null ? webPushNotificationService.countSubscriptions(user) : 0);
        }
        if (telegramSent || webPushSent) {
          plant.setLastReminderDate(today);
          plantRepository.save(plant);
        }
      }
    }
  }

  private boolean shouldUseTelegram(User user) {
    if (user == null || user.getTelegramId() == null || user.getTelegramId() <= 0) {
      return false;
    }
    long telegramId = user.getTelegramId();
    if (telegramId >= PSEUDO_TELEGRAM_ID_MIN) {
      return false;
    }
    return !(devAuthEnabled && telegramId == devTelegramId);
  }
}
