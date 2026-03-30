package com.example.plantbot.service;

import com.example.plantbot.controller.dto.PlantUpdateRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.util.WateringRecommendation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantMutationService {
  private static final int MAX_RETRIES = 6;
  private final ConcurrentHashMap<Long, ReentrantLock> plantLocks = new ConcurrentHashMap<>();

  private final PlantService plantService;
  private final WateringRecommendationService wateringRecommendationService;
  private final WateringLogService wateringLogService;
  private final PlatformTransactionManager transactionManager;

  public Plant updatePlant(Plant plant, PlantUpdateRequest request) {
    if (request == null) {
      return plant;
    }
    if (request.potVolumeLiters() != null) {
      plant.setPotVolumeLiters(request.potVolumeLiters());
    }
    if (request.preferredWaterMl() != null) {
      plant.setPreferredWaterMl(request.preferredWaterMl());
    }
    if (request.baseIntervalDays() != null) {
      plant.setBaseIntervalDays(request.baseIntervalDays());
    }
    return plantService.save(plant);
  }

  public Plant markWatered(User user, Long plantId) {
    return markWatered(plantId, user == null ? null : user.getId());
  }

  public Plant markWatered(Long plantId, Long userId) {
    ReentrantLock lock = plantLocks.computeIfAbsent(plantId, ignored -> new ReentrantLock());
    lock.lock();
    try {
      return doMarkWatered(plantId, userId);
    } finally {
      try {
        if (!lock.hasQueuedThreads()) {
          plantLocks.remove(plantId, lock);
        }
      } finally {
        lock.unlock();
      }
    }
  }

  private Plant doMarkWatered(Long plantId, Long userId) {
    TransactionTemplate template = new TransactionTemplate(transactionManager);
    RuntimeException lastFailure = null;

    for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return template.execute(status -> {
          Plant plant = plantService.getByIdAndUserId(plantId, userId);
          if (plant == null) {
            throw new IllegalStateException("Plant not found");
          }
          LocalDate today = LocalDate.now();
          if (Objects.equals(plant.getLastWateredDate(), today)) {
            if (plant.getLastReminderDate() == null) {
              return plant;
            }
            plant.setLastReminderDate(null);
            return plantService.save(plant);
          }
          WateringRecommendation rec = wateringRecommendationService.recommendQuick(plant);
          plant.setLastWateredDate(today);
          plant.setLastReminderDate(null);
          Plant saved = plantService.save(plant);
          wateringLogService.addLog(saved, today, rec.intervalDays(), rec.waterLiters(), null, null);
          return saved;
        });
      } catch (RuntimeException ex) {
        lastFailure = ex;
        if (!isRetryableSqliteWriteFailure(ex) || attempt == MAX_RETRIES) {
          throw ex;
        }
        log.warn("Retrying watered mutation for plantId={} attempt={} because of transient DB contention: {}",
            plantId, attempt, ex.getMessage());
        sleepBeforeRetry(attempt);
      }
    }

    throw lastFailure == null ? new IllegalStateException("Unknown watering mutation failure") : lastFailure;
  }

  private boolean isRetryableSqliteWriteFailure(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof JpaSystemException || current.getClass().getName().contains("SQLite")) {
        String message = current.getMessage();
        if (message != null) {
          String lower = message.toLowerCase();
          if (lower.contains("database is locked")
              || lower.contains("sqlite_busy")
              || lower.contains("busy")
              || lower.contains("locked")) {
            return true;
          }
        }
      }
      current = current.getCause();
    }
    return false;
  }

  private void sleepBeforeRetry(int attempt) {
    try {
      Thread.sleep(100L * attempt);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }
}
