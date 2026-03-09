package com.example.plantbot.service.ha;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import com.example.plantbot.domain.ha.PlantHomeAssistantBinding;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class HomeAssistantPlantContextService {
  private final HomeAssistantIntegrationService integrationService;
  private final HomeAssistantApiService homeAssistantApiService;

  public WateringSensorContextDto resolveForPreview(User user, WateringRecommendationPreviewRequest request) {
    if (request == null || request.plantName() == null || request.plantName().isBlank()) {
      return unavailable("Для HA-контекста нужно имя растения.");
    }
    return resolveContext(
        user,
        request.plantName().trim(),
        request.haRoomId(),
        request.haRoomName(),
        request.temperatureSensorEntityId(),
        request.humiditySensorEntityId(),
        request.soilMoistureSensorEntityId(),
        request.illuminanceSensorEntityId()
    );
  }

  public WateringSensorContextDto resolveForPlant(User user, Plant plant) {
    if (plant == null || plant.getName() == null || plant.getName().isBlank()) {
      return unavailable("Растение не найдено для получения HA-контекста.");
    }

    Optional<PlantHomeAssistantBinding> bindingOpt = integrationService.getBinding(plant);
    if (bindingOpt.isEmpty()) {
      return unavailable("HA room/sensor binding не настроен.");
    }

    PlantHomeAssistantBinding binding = bindingOpt.get();
    return resolveContext(
        user,
        plant.getName().trim(),
        binding.getAreaId(),
        binding.getAreaName(),
        binding.getTemperatureEntityId(),
        binding.getHumidityEntityId(),
        binding.getSoilMoistureEntityId(),
        binding.getIlluminanceEntityId()
    );
  }

  private WateringSensorContextDto resolveContext(User user,
                                                  String plantName,
                                                  String roomId,
                                                  String roomName,
                                                  String temperatureSensorEntityId,
                                                  String humiditySensorEntityId,
                                                  String soilMoistureSensorEntityId,
                                                  String illuminanceSensorEntityId) {
    Optional<HomeAssistantConnection> connectionOpt = integrationService.getConnection(user);
    if (connectionOpt.isEmpty()) {
      return unavailable("Home Assistant не подключен.");
    }

    HomeAssistantConnection connection = connectionOpt.get();
    String token = integrationService.decryptToken(connection);
    List<HaSensorReading> sensors = homeAssistantApiService.loadSensors(connection.getBaseUrl(), token);
    if (sensors.isEmpty()) {
      return unavailable("Нет доступных сенсоров Home Assistant.");
    }

    Map<HaSensorKind, HaSensorReading> selected = selectSensors(
        sensors,
        plantName,
        roomId,
        roomName,
        temperatureSensorEntityId,
        humiditySensorEntityId,
        soilMoistureSensorEntityId,
        illuminanceSensorEntityId
    );
    if (selected.isEmpty()) {
      return unavailable("Не удалось подобрать сенсоры для выбранной комнаты/растения.");
    }

    HaSensorReading temp = selected.get(HaSensorKind.TEMPERATURE);
    HaSensorReading hum = selected.get(HaSensorKind.HUMIDITY);
    HaSensorReading soil = selected.get(HaSensorKind.SOIL_MOISTURE);
    HaSensorReading lux = selected.get(HaSensorKind.ILLUMINANCE);

    int signalCount = 0;
    if (temp != null && temp.value() != null) {
      signalCount++;
    }
    if (hum != null && hum.value() != null) {
      signalCount++;
    }
    if (soil != null && soil.value() != null) {
      signalCount++;
    }
    if (lux != null && lux.value() != null) {
      signalCount++;
    }

    SensorConfidence confidence = switch (signalCount) {
      case 4, 3 -> SensorConfidence.HIGH;
      case 2 -> SensorConfidence.MEDIUM;
      case 1 -> SensorConfidence.LOW;
      default -> SensorConfidence.NONE;
    };

    String resolvedRoomId = firstNonBlank(roomId,
        temp == null ? null : temp.areaId(),
        hum == null ? null : hum.areaId(),
        soil == null ? null : soil.areaId(),
        lux == null ? null : lux.areaId());

    String resolvedRoomName = firstNonBlank(roomName,
        temp == null ? null : temp.areaName(),
        hum == null ? null : hum.areaName(),
        soil == null ? null : soil.areaName(),
        lux == null ? null : lux.areaName());

    List<String> sensorIds = selected.values().stream()
        .map(HaSensorReading::entityId)
        .sorted(Comparator.naturalOrder())
        .toList();

    return new WateringSensorContextDto(
        signalCount > 0,
        resolvedRoomId,
        resolvedRoomName,
        temp == null ? null : temp.value(),
        hum == null ? null : hum.value(),
        soil == null ? null : soil.value(),
        lux == null ? null : lux.value(),
        confidence,
        "HA:" + (isManualSelection(temperatureSensorEntityId, humiditySensorEntityId, soilMoistureSensorEntityId, illuminanceSensorEntityId) ? "manual" : "auto"),
        sensorIds,
        signalCount > 0 ? "Контекст Home Assistant применён." : "Сенсоры не вернули значения."
    );
  }

  private Map<HaSensorKind, HaSensorReading> selectSensors(List<HaSensorReading> sensors,
                                                            String plantName,
                                                            String roomId,
                                                            String roomName,
                                                            String temperatureSensorEntityId,
                                                            String humiditySensorEntityId,
                                                            String soilMoistureSensorEntityId,
                                                            String illuminanceSensorEntityId) {
    if (isManualSelection(temperatureSensorEntityId, humiditySensorEntityId, soilMoistureSensorEntityId, illuminanceSensorEntityId)) {
      Map<HaSensorKind, HaSensorReading> selected = new EnumMap<>(HaSensorKind.class);
      findByEntityId(sensors, temperatureSensorEntityId).ifPresent(r -> selected.put(HaSensorKind.TEMPERATURE, r));
      findByEntityId(sensors, humiditySensorEntityId).ifPresent(r -> selected.put(HaSensorKind.HUMIDITY, r));
      findByEntityId(sensors, soilMoistureSensorEntityId).ifPresent(r -> selected.put(HaSensorKind.SOIL_MOISTURE, r));
      findByEntityId(sensors, illuminanceSensorEntityId).ifPresent(r -> selected.put(HaSensorKind.ILLUMINANCE, r));
      return selected;
    }
    return homeAssistantApiService.autoDiscoverForPlant(sensors, roomId, roomName, plantName);
  }

  private boolean isManualSelection(String temperatureSensorEntityId,
                                    String humiditySensorEntityId,
                                    String soilMoistureSensorEntityId,
                                    String illuminanceSensorEntityId) {
    return notBlank(temperatureSensorEntityId)
        || notBlank(humiditySensorEntityId)
        || notBlank(soilMoistureSensorEntityId)
        || notBlank(illuminanceSensorEntityId);
  }

  private Optional<HaSensorReading> findByEntityId(List<HaSensorReading> sensors, String entityId) {
    if (!notBlank(entityId)) {
      return Optional.empty();
    }
    return sensors.stream()
        .filter(sensor -> entityId.trim().equalsIgnoreCase(sensor.entityId()))
        .findFirst();
  }

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (notBlank(value)) {
        return value.trim();
      }
    }
    return null;
  }

  private boolean notBlank(String value) {
    return value != null && !value.isBlank();
  }

  private WateringSensorContextDto unavailable(String message) {
    return new WateringSensorContextDto(
        false,
        null,
        null,
        null,
        null,
        null,
        null,
        SensorConfidence.NONE,
        "HA:none",
        List.of(),
        message
    );
  }
}
