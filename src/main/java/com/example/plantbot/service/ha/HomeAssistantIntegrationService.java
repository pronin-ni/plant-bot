package com.example.plantbot.service.ha;

import com.example.plantbot.controller.dto.ha.HaRoomDto;
import com.example.plantbot.controller.dto.ha.HaSensorDto;
import com.example.plantbot.controller.dto.ha.HomeAssistantRoomsSensorsResponse;
import com.example.plantbot.controller.dto.ha.PlantConditionPointResponse;
import com.example.plantbot.controller.dto.ha.PlantConditionsHistoryResponse;
import com.example.plantbot.controller.dto.ha.PlantConditionsResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.HaSensorSelectionMode;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import com.example.plantbot.domain.ha.PlantAdjustmentLog;
import com.example.plantbot.domain.ha.PlantConditionSample;
import com.example.plantbot.domain.ha.PlantHomeAssistantBinding;
import com.example.plantbot.repository.ha.HomeAssistantConnectionRepository;
import com.example.plantbot.repository.ha.PlantAdjustmentLogRepository;
import com.example.plantbot.repository.ha.PlantConditionSampleRepository;
import com.example.plantbot.repository.ha.PlantHomeAssistantBindingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class HomeAssistantIntegrationService {
  private final HomeAssistantConnectionRepository connectionRepository;
  private final PlantHomeAssistantBindingRepository bindingRepository;
  private final PlantConditionSampleRepository conditionSampleRepository;
  private final PlantAdjustmentLogRepository adjustmentLogRepository;
  private final HomeAssistantApiService haApiService;
  private final AesTokenCryptoService cryptoService;

  public HomeAssistantConnection upsertConnection(User user, String baseUrl, String token, String instanceName, boolean connected) {
    HomeAssistantConnection connection = connectionRepository.findByUser(user).orElseGet(HomeAssistantConnection::new);
    connection.setUser(user);
    connection.setBaseUrl(baseUrl);
    connection.setEncryptedToken(cryptoService.encrypt(token));
    connection.setConnected(connected);
    connection.setInstanceName(instanceName);
    connection.setUpdatedAt(Instant.now());
    if (connected) {
      connection.setLastSuccessAt(Instant.now());
      connection.setConsecutiveFailures(0);
    }
    return connectionRepository.save(connection);
  }

  public HomeAssistantRoomsSensorsResponse getRoomsAndSensors(User user) {
    Optional<HomeAssistantConnection> connectionOpt = connectionRepository.findByUser(user);
    if (connectionOpt.isEmpty()) {
      return new HomeAssistantRoomsSensorsResponse(false, List.of(), List.of(), "Home Assistant не подключен");
    }
    HomeAssistantConnection connection = connectionOpt.get();
    String token = cryptoService.decrypt(connection.getEncryptedToken());
    HaProbeResult probe = haApiService.probe(connection.getBaseUrl(), token);
    List<HaRoomDto> rooms = probe.rooms().stream().map(room -> new HaRoomDto(room.id(), room.name())).toList();
    List<HaSensorDto> sensors = probe.sensors().stream().map(this::toSensorDto).toList();
    return new HomeAssistantRoomsSensorsResponse(probe.connected(), rooms, sensors, probe.message());
  }

  public PlantHomeAssistantBinding upsertPlantBinding(Plant plant,
                                                      String areaId,
                                                      String areaName,
                                                      HaSensorSelectionMode selectionMode,
                                                      String temperatureEntityId,
                                                      String humidityEntityId,
                                                      String soilMoistureEntityId,
                                                      String illuminanceEntityId,
                                                      Boolean autoAdjustmentEnabled,
                                                      Double maxAdjustmentFraction) {
    PlantHomeAssistantBinding binding = bindingRepository.findByPlant(plant).orElseGet(PlantHomeAssistantBinding::new);
    binding.setPlant(plant);
    binding.setAreaId(blankToNull(areaId));
    binding.setAreaName(blankToNull(areaName));
    binding.setSelectionMode(selectionMode == null ? HaSensorSelectionMode.AUTO_DISCOVERY : selectionMode);
    binding.setTemperatureEntityId(blankToNull(temperatureEntityId));
    binding.setHumidityEntityId(blankToNull(humidityEntityId));
    binding.setSoilMoistureEntityId(blankToNull(soilMoistureEntityId));
    binding.setIlluminanceEntityId(blankToNull(illuminanceEntityId));
    binding.setAutoAdjustmentEnabled(autoAdjustmentEnabled == null ? Boolean.TRUE : autoAdjustmentEnabled);
    double maxAdj = maxAdjustmentFraction == null ? 0.35 : maxAdjustmentFraction;
    binding.setMaxAdjustmentFraction(Math.max(0.1, Math.min(0.35, maxAdj)));
    binding.setUpdatedAt(Instant.now());
    return bindingRepository.save(binding);
  }

  public Optional<PlantHomeAssistantBinding> getBinding(Plant plant) {
    return bindingRepository.findByPlant(plant);
  }

  public Optional<HomeAssistantConnection> getConnection(User user) {
    return connectionRepository.findByUser(user);
  }

  public String decryptToken(HomeAssistantConnection connection) {
    return cryptoService.decrypt(connection.getEncryptedToken());
  }

  public void saveConditionSample(Plant plant, PlantConditionSnapshot snapshot) {
    PlantConditionSample sample = new PlantConditionSample();
    sample.setPlant(plant);
    sample.setSampledAt(snapshot.sampledAt());
    sample.setTemperatureC(snapshot.temperatureC());
    sample.setHumidityPercent(snapshot.humidityPercent());
    sample.setSoilMoisturePercent(snapshot.soilMoisturePercent());
    sample.setIlluminanceLux(snapshot.illuminanceLux());
    sample.setSource(snapshot.source());
    conditionSampleRepository.save(sample);
  }

  public Optional<PlantConditionSnapshot> getLatestConditions(Plant plant) {
    return conditionSampleRepository.findTopByPlantOrderBySampledAtDesc(plant)
        .map(sample -> new PlantConditionSnapshot(
            sample.getSampledAt(),
            sample.getTemperatureC(),
            sample.getHumidityPercent(),
            sample.getSoilMoisturePercent(),
            sample.getIlluminanceLux(),
            sample.getSource()));
  }

  public PlantConditionsResponse getCurrentConditionsResponse(Plant plant) {
    Optional<PlantConditionSnapshot> latest = getLatestConditions(plant);
    Optional<PlantHomeAssistantBinding> binding = getBinding(plant);
    Double latestAdjustment = getLatestAdjustmentPercent(plant);
    boolean adjustedToday = isAdjustedToday(plant);

    if (latest.isEmpty()) {
      return new PlantConditionsResponse(
          plant.getId(),
          plant.getName(),
          null,
          null,
          null,
          null,
          null,
          null,
          binding.map(PlantHomeAssistantBinding::getAutoAdjustmentEnabled).orElse(Boolean.TRUE),
          adjustedToday,
          latestAdjustment,
          null
      );
    }

    PlantConditionSnapshot snapshot = latest.get();
    return new PlantConditionsResponse(
        plant.getId(),
        plant.getName(),
        snapshot.sampledAt(),
        snapshot.temperatureC(),
        snapshot.humidityPercent(),
        snapshot.soilMoisturePercent(),
        snapshot.illuminanceLux(),
        illuminanceWarning(snapshot.illuminanceLux()),
        binding.map(PlantHomeAssistantBinding::getAutoAdjustmentEnabled).orElse(Boolean.TRUE),
        adjustedToday,
        latestAdjustment,
        snapshot.source());
  }

  public PlantConditionsHistoryResponse getHistory(Plant plant, int days) {
    int safeDays = Math.max(1, Math.min(30, days));
    Instant from = Instant.now().minus(Duration.ofDays(safeDays));
    List<PlantConditionPointResponse> points = conditionSampleRepository
        .findByPlantAndSampledAtAfterOrderBySampledAtAsc(plant, from)
        .stream()
        .map(s -> new PlantConditionPointResponse(s.getSampledAt(), s.getTemperatureC(), s.getHumidityPercent(), s.getSoilMoisturePercent(), s.getIlluminanceLux()))
        .toList();

    List<PlantAdjustmentLog> logs = adjustmentLogRepository.findByPlantAndCreatedAtAfterOrderByCreatedAtDesc(plant, from);
    PlantAdjustmentLog latest = logs.isEmpty() ? null : logs.get(0);

    return new PlantConditionsHistoryResponse(
        plant.getId(),
        safeDays,
        points,
        isAdjustedToday(plant),
        latest == null ? null : latest.getDeltaPercent(),
        latest == null ? null : latest.getReason()
    );
  }

  public void logAdjustment(Plant plant, double baseInterval, IntervalAdjustmentResult result) {
    PlantAdjustmentLog logEntry = new PlantAdjustmentLog();
    logEntry.setPlant(plant);
    logEntry.setBaseIntervalDays(baseInterval);
    logEntry.setAdjustedIntervalDays(result.intervalDays());
    logEntry.setDeltaPercent(result.deltaPercent());
    logEntry.setAdjustmentApplied(result.applied());
    logEntry.setSource(result.source());
    logEntry.setReason(result.reason());
    adjustmentLogRepository.save(logEntry);
  }

  public IntervalAdjustmentResult applyHaAdjustment(Plant plant, User user, double intervalDays) {
    Optional<PlantHomeAssistantBinding> bindingOpt = bindingRepository.findByPlant(plant);
    if (bindingOpt.isEmpty()) {
      return new IntervalAdjustmentResult(intervalDays, false, 0.0, "HA binding отсутствует", "HA");
    }

    PlantHomeAssistantBinding binding = bindingOpt.get();
    if (!Boolean.TRUE.equals(binding.getAutoAdjustmentEnabled())) {
      return new IntervalAdjustmentResult(intervalDays, false, 0.0, "Автокоррекция отключена", "HA");
    }

    Optional<HomeAssistantConnection> connectionOpt = connectionRepository.findByUser(user);
    if (connectionOpt.isEmpty()) {
      return new IntervalAdjustmentResult(intervalDays, false, 0.0, "HA не подключен", "HA");
    }

    HomeAssistantConnection connection = connectionOpt.get();
    if (connection.getLastSuccessAt() == null || Duration.between(connection.getLastSuccessAt(), Instant.now()).toHours() > 6) {
      return new IntervalAdjustmentResult(intervalDays, false, 0.0, "HA недоступен > 6 часов, fallback", "HA");
    }

    Optional<PlantConditionSnapshot> snapshotOpt = getLatestConditions(plant);
    if (snapshotOpt.isEmpty()) {
      return new IntervalAdjustmentResult(intervalDays, false, 0.0, "Нет данных сенсоров", "HA");
    }

    PlantConditionSnapshot snapshot = snapshotOpt.get();
    double factor = 1.0;
    List<String> reasons = new ArrayList<>();

    if (snapshot.soilMoisturePercent() != null) {
      if (snapshot.soilMoisturePercent() < 30) {
        factor *= 0.8;
        reasons.add("сухая почва");
      } else if (snapshot.soilMoisturePercent() > 65) {
        factor *= 1.15;
        reasons.add("почва влажная");
      }
    }

    if (snapshot.temperatureC() != null) {
      if (snapshot.temperatureC() > 30) {
        factor *= 0.9;
        reasons.add("жарко");
      } else if (snapshot.temperatureC() < 12) {
        factor *= 1.1;
        reasons.add("прохладно");
      }
    }

    if (snapshot.humidityPercent() != null) {
      if (snapshot.humidityPercent() < 35) {
        factor *= 0.93;
        reasons.add("сухой воздух");
      } else if (snapshot.humidityPercent() > 75) {
        factor *= 1.08;
        reasons.add("влажный воздух");
      }
    }

    if (snapshot.illuminanceLux() != null) {
      if (snapshot.illuminanceLux() > 20000) {
        factor *= 0.94;
        reasons.add("высокая освещенность");
      } else if (snapshot.illuminanceLux() < 800) {
        factor *= 1.08;
        reasons.add("низкая освещенность");
      }
    }

    double maxAdj = binding.getMaxAdjustmentFraction() == null ? 0.35 : binding.getMaxAdjustmentFraction();
    double minFactor = 1.0 - maxAdj;
    double maxFactor = 1.0 + maxAdj;
    double clampedFactor = Math.max(minFactor, Math.min(maxFactor, factor));

    double adjusted = round(intervalDays * clampedFactor);
    double deltaPercent = round((clampedFactor - 1.0) * 100.0);
    boolean applied = Math.abs(deltaPercent) >= 0.5;
    String reason = applied ? String.join(", ", reasons) : "изменение не требуется";

    return new IntervalAdjustmentResult(adjusted, applied, deltaPercent, reason, "HA");
  }

  public void markConnectionFailure(HomeAssistantConnection connection) {
    int failures = connection.getConsecutiveFailures() == null ? 0 : connection.getConsecutiveFailures();
    connection.setConsecutiveFailures(failures + 1);
    connection.setLastFailureAt(Instant.now());
    connection.setConnected(false);
    connection.setUpdatedAt(Instant.now());
    connectionRepository.save(connection);
  }

  public void markConnectionSuccess(HomeAssistantConnection connection) {
    connection.setConsecutiveFailures(0);
    connection.setConnected(true);
    connection.setLastSuccessAt(Instant.now());
    connection.setUpdatedAt(Instant.now());
    connectionRepository.save(connection);
  }

  public List<HomeAssistantConnection> findConnectedConnections() {
    return connectionRepository.findAll();
  }

  public HomeAssistantConnection saveConnection(HomeAssistantConnection connection) {
    connection.setUpdatedAt(Instant.now());
    return connectionRepository.save(connection);
  }

  public List<PlantHomeAssistantBinding> findBindings(User user) {
    return bindingRepository.findAllByUser(user);
  }

  public Optional<PlantConditionSnapshot> resolveSnapshotForPlant(Plant plant,
                                                                  PlantHomeAssistantBinding binding,
                                                                  List<HaSensorReading> sensors) {
    String roomId = binding.getAreaId();
    String roomName = binding.getAreaName();

    Map<HaSensorKind, HaSensorReading> selected = new java.util.EnumMap<>(HaSensorKind.class);
    if (binding.getSelectionMode() == HaSensorSelectionMode.MANUAL) {
      findByEntityId(sensors, binding.getTemperatureEntityId()).ifPresent(r -> selected.put(HaSensorKind.TEMPERATURE, r));
      findByEntityId(sensors, binding.getHumidityEntityId()).ifPresent(r -> selected.put(HaSensorKind.HUMIDITY, r));
      findByEntityId(sensors, binding.getSoilMoistureEntityId()).ifPresent(r -> selected.put(HaSensorKind.SOIL_MOISTURE, r));
      findByEntityId(sensors, binding.getIlluminanceEntityId()).ifPresent(r -> selected.put(HaSensorKind.ILLUMINANCE, r));
    } else {
      selected.putAll(haApiService.autoDiscoverForPlant(sensors, roomId, roomName, plant.getName()));
    }

    HaSensorReading temp = selected.get(HaSensorKind.TEMPERATURE);
    HaSensorReading hum = selected.get(HaSensorKind.HUMIDITY);
    HaSensorReading soil = selected.get(HaSensorKind.SOIL_MOISTURE);
    HaSensorReading lux = selected.get(HaSensorKind.ILLUMINANCE);

    if (temp == null && hum == null && soil == null && lux == null) {
      return Optional.empty();
    }

    return Optional.of(new PlantConditionSnapshot(
        Instant.now(),
        temp == null ? null : temp.value(),
        hum == null ? null : hum.value(),
        soil == null ? null : soil.value(),
        lux == null ? null : lux.value(),
        "HA:" + (binding.getSelectionMode() == HaSensorSelectionMode.MANUAL ? "manual" : "auto")
    ));
  }

  private Optional<HaSensorReading> findByEntityId(List<HaSensorReading> sensors, String entityId) {
    if (entityId == null || entityId.isBlank()) {
      return Optional.empty();
    }
    return sensors.stream().filter(sensor -> entityId.equalsIgnoreCase(sensor.entityId())).findFirst();
  }

  private HaSensorDto toSensorDto(HaSensorReading sensor) {
    return new HaSensorDto(
        sensor.entityId(),
        sensor.friendlyName(),
        sensor.kind().name(),
        sensor.areaId(),
        sensor.areaName(),
        sensor.unit(),
        sensor.value(),
        sensor.fromAttribute());
  }

  private String illuminanceWarning(Double lux) {
    if (lux == null) {
      return null;
    }
    if (lux < 800) {
      return "Света мало";
    }
    if (lux > 25000) {
      return "Слишком ярко";
    }
    return "Освещенность в норме";
  }

  private boolean isAdjustedToday(Plant plant) {
    Instant dayStart = LocalDate.now().atStartOfDay().toInstant(ZoneOffset.UTC);
    return !adjustmentLogRepository.findByPlantAndCreatedAtAfterOrderByCreatedAtDesc(plant, dayStart).isEmpty();
  }

  private Double getLatestAdjustmentPercent(Plant plant) {
    Instant weekAgo = Instant.now().minus(Duration.ofDays(7));
    return adjustmentLogRepository.findByPlantAndCreatedAtAfterOrderByCreatedAtDesc(plant, weekAgo).stream()
        .max(Comparator.comparing(PlantAdjustmentLog::getCreatedAt))
        .map(PlantAdjustmentLog::getDeltaPercent)
        .orElse(null);
  }

  private String blankToNull(String raw) {
    if (raw == null) {
      return null;
    }
    String trimmed = raw.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private double round(double value) {
    return Math.round(value * 100.0) / 100.0;
  }
}
