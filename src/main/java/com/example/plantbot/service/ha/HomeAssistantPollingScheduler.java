package com.example.plantbot.service.ha;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import com.example.plantbot.domain.ha.PlantHomeAssistantBinding;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class HomeAssistantPollingScheduler {
  private final HomeAssistantIntegrationService haIntegrationService;
  private final HomeAssistantApiService haApiService;

  @Value("${home-assistant.poll-random-offset-max-seconds:300}")
  private long randomOffsetMaxSeconds;

  @Scheduled(cron = "0 0 * * * *")
  public void pollHomeAssistant() {
    randomOffsetSleep();

    List<HomeAssistantConnection> connections = haIntegrationService.findConnectedConnections();
    for (HomeAssistantConnection connection : connections) {
      User user = connection.getUser();
      try {
        String token = haIntegrationService.decryptToken(connection);
        List<HaSensorReading> sensors = haApiService.loadSensors(connection.getBaseUrl(), token);

        List<PlantHomeAssistantBinding> bindings = haIntegrationService.findBindings(user);
        for (PlantHomeAssistantBinding binding : bindings) {
          haIntegrationService.resolveSnapshotForPlant(binding.getPlant(), binding, sensors)
              .ifPresent(snapshot -> haIntegrationService.saveConditionSample(binding.getPlant(), snapshot));
        }

        haIntegrationService.markConnectionSuccess(connection);
      } catch (Exception ex) {
        log.warn("HA polling failed for user={} : {}", user.getTelegramId(), ex.getMessage());
        haIntegrationService.markConnectionFailure(connection);
        notifyIfUnavailableTooLong(connection);
      }
    }
  }

  private void randomOffsetSleep() {
    long max = Math.max(0, randomOffsetMaxSeconds);
    if (max == 0) {
      return;
    }
    long sleepMs = ThreadLocalRandom.current().nextLong(0, max + 1) * 1000;
    try {
      Thread.sleep(sleepMs);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }

  private void notifyIfUnavailableTooLong(HomeAssistantConnection connection) {
    Instant lastSuccess = connection.getLastSuccessAt();
    if (lastSuccess == null) {
      return;
    }

    long hours = Duration.between(lastSuccess, Instant.now()).toHours();
    if (hours < 6) {
      return;
    }

    Instant lastAlert = connection.getLastUnavailableAlertAt();
    if (lastAlert != null && Duration.between(lastAlert, Instant.now()).toHours() < 6) {
      return;
    }

    String text = "⚠️ Home Assistant недоступен более 6 часов. "
        + "Автокоррекция временно отключена, используем базовый график полива.";
    log.warn("HA long outage notification not delivered via Telegram anymore: userId={} message='{}'",
        connection.getUser() != null ? connection.getUser().getId() : null, text);
    connection.setLastUnavailableAlertAt(Instant.now());
    haIntegrationService.saveConnection(connection);
  }
}
