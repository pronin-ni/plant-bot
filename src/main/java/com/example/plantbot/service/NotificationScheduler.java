package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.RuntimeRecommendationAdapter;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.example.plantbot.service.recommendation.runtime.LegacyRuntimeRecommendationDelegate;
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
  private final LearningService learningService;
  private final PlantRecommendationContextMapper plantRecommendationContextMapper;
  private final RecommendationFacade recommendationFacade;
  private final RuntimeRecommendationAdapter runtimeRecommendationAdapter;
  private final LegacyRuntimeRecommendationDelegate legacyRuntimeRecommendationDelegate;
  private final WebPushNotificationService webPushNotificationService;

  @Scheduled(cron = "${scheduler.daily-cron}")
  public void dailyCheck() {
    LocalDate today = LocalDate.now();
    List<Plant> plants = plantRepository.findAll();
    for (Plant plant : plants) {
      User user = plant.getUser();
      RecommendationRequestContext context = buildNotificationContext(plant, user);
      RecommendationResult result = recommendationFacade.runtime(context);
      WateringRecommendation rec = runtimeRecommendationAdapter.adapt(result);
      WateringRecommendation legacy = legacyRuntimeRecommendationDelegate.recommendProfile(plant, user, true, false, false);
      logNotificationDualRun(plant, rec, legacy);
      if (rec.waterLiters() <= 0.0) {
        continue;
      }
      LocalDate dueDate = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));
      boolean due = !today.isBefore(dueDate);
      boolean alreadyRemindedToday = today.equals(plant.getLastReminderDate());
      if (due && !alreadyRemindedToday) {
        boolean webPushSent = webPushNotificationService.sendWateringReminder(plant, result);
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

  RecommendationRequestContext buildNotificationContext(Plant plant, User user) {
    double base = plant.getBaseIntervalDays();
    var avgActual = learningService.getAverageInterval(plant);
    var smoothed = learningService.getSmoothedInterval(plant);
    Object learningContext = new com.example.plantbot.util.LearningInfo(
        base,
        avgActual.isPresent() ? avgActual.getAsDouble() : null,
        smoothed.isPresent() ? smoothed.getAsDouble() : null,
        1.0,
        1.0,
        1.0,
        smoothed.isPresent() ? smoothed.getAsDouble() : base
    );
    return plantRecommendationContextMapper.mapForNotification(plant, user, learningContext);
  }

  private void logNotificationDualRun(Plant plant, WateringRecommendation unified, WateringRecommendation legacy) {
    if (plant == null || unified == null || legacy == null) {
      return;
    }
    double intervalDiff = Math.abs(unified.intervalDays() - legacy.intervalDays());
    double waterDiffMl = Math.abs(unified.waterLiters() - legacy.waterLiters()) * 1000.0;
    LocalDate unifiedDue = plant.getLastWateredDate().plusDays((long) Math.floor(unified.intervalDays()));
    LocalDate legacyDue = plant.getLastWateredDate().plusDays((long) Math.floor(legacy.intervalDays()));
    boolean dueShifted = !unifiedDue.equals(legacyDue);
    if (intervalDiff >= 1.0 || waterDiffMl >= 250.0 || dueShifted) {
      log.warn("Notification dual-run drift: plantId={} intervalNew={} intervalOld={} waterMlNew={} waterMlOld={} dueNew={} dueOld={}",
          plant.getId(),
          roundTwoDecimals(unified.intervalDays()),
          roundTwoDecimals(legacy.intervalDays()),
          Math.round(unified.waterLiters() * 1000.0),
          Math.round(legacy.waterLiters() * 1000.0),
          unifiedDue,
          legacyDue);
    } else {
      log.debug("Notification dual-run parity ok: plantId={} intervalDiff={} waterDiffMl={}",
          plant.getId(),
          roundTwoDecimals(intervalDiff),
          Math.round(waterDiffMl));
    }
  }

  private double roundTwoDecimals(double value) {
    return Math.round(value * 100.0) / 100.0;
  }
}
