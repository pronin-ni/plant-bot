package com.example.plantbot.service.ha;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class HomeAssistantApiService {
  private final ObjectMapper objectMapper;

  @Value("${home-assistant.http-timeout-ms:10000}")
  private int timeoutMs;

  @Value("${home-assistant.retry-count:3}")
  private int retryCount;

  public HaProbeResult probe(String baseUrl, String token) {
    try {
      String normalized = normalizeBaseUrl(baseUrl);
      RestTemplate restTemplate = restTemplate();
      HttpHeaders headers = authHeaders(token);

      ResponseEntity<String> configResponse = executeWithRetry(restTemplate,
          normalized + "/api/config",
          HttpMethod.GET,
          new HttpEntity<>(headers));

      JsonNode config = objectMapper.readTree(configResponse.getBody());
      String instanceName = config.path("location_name").asText("Home Assistant");

      List<HaSensorReading> sensors = loadSensors(restTemplate, normalized, headers);
      List<HaRoom> rooms = buildRooms(sensors);
      return new HaProbeResult(true, instanceName, "Подключение успешно", rooms, sensors);
    } catch (Exception ex) {
      log.warn("HA probe failed for {}: {}", baseUrl, ex.getMessage());
      return new HaProbeResult(false, null, "Не удалось подключиться к Home Assistant: " + ex.getMessage(), List.of(), List.of());
    }
  }

  public List<HaSensorReading> loadSensors(String baseUrl, String token) {
    String normalized = normalizeBaseUrl(baseUrl);
    RestTemplate restTemplate = restTemplate();
    HttpHeaders headers = authHeaders(token);
    return loadSensors(restTemplate, normalized, headers);
  }

  private List<HaSensorReading> loadSensors(RestTemplate restTemplate, String baseUrl, HttpHeaders headers) {
    try {
      ResponseEntity<String> statesResponse = executeWithRetry(restTemplate,
          baseUrl + "/api/states",
          HttpMethod.GET,
          new HttpEntity<>(headers));

      JsonNode states = objectMapper.readTree(statesResponse.getBody());
      List<HaSensorReading> readings = new ArrayList<>();
      for (JsonNode state : states) {
        String entityId = state.path("entity_id").asText("");
        if (entityId.isBlank() || !entityId.startsWith("sensor.")) {
          continue;
        }
        JsonNode attributes = state.path("attributes");
        String friendlyName = attributes.path("friendly_name").asText(entityId);
        String areaId = attributes.path("area_id").asText("");
        String areaName = extractAreaName(attributes, entityId);
        String unit = attributes.path("unit_of_measurement").asText("");

        HaSensorKind kind = detectKind(entityId, attributes);
        if (kind == HaSensorKind.OTHER) {
          continue;
        }

        Double value = parseValue(state.path("state").asText(null));
        boolean fromAttribute = false;
        if (value == null) {
          value = valueFromAttributes(attributes, kind);
          fromAttribute = value != null;
        }

        readings.add(new HaSensorReading(entityId, friendlyName, emptyToNull(areaId), areaName, unit, kind, value, fromAttribute));
      }
      return readings;
    } catch (Exception ex) {
      log.warn("HA sensors load failed: {}", ex.getMessage());
      return List.of();
    }
  }

  private List<HaRoom> buildRooms(List<HaSensorReading> sensors) {
    Map<String, String> rooms = new LinkedHashMap<>();
    for (HaSensorReading sensor : sensors) {
      String areaId = sensor.areaId();
      String areaName = sensor.areaName();
      if (areaName == null || areaName.isBlank()) {
        continue;
      }
      rooms.put(areaId == null ? areaName.toLowerCase(Locale.ROOT) : areaId, areaName);
    }
    return rooms.entrySet().stream().map(e -> new HaRoom(e.getKey(), e.getValue())).toList();
  }

  public Map<HaSensorKind, HaSensorReading> autoDiscoverForPlant(List<HaSensorReading> sensors,
                                                                  String roomId,
                                                                  String roomName,
                                                                  String plantName) {
    Map<HaSensorKind, HaSensorReading> selected = new HashMap<>();
    for (HaSensorKind kind : List.of(HaSensorKind.TEMPERATURE, HaSensorKind.HUMIDITY, HaSensorKind.SOIL_MOISTURE, HaSensorKind.ILLUMINANCE)) {
      Optional<HaSensorReading> reading = sensors.stream()
          .filter(sensor -> sensor.kind() == kind)
          .filter(sensor -> roomMatches(sensor, roomId, roomName))
          .findFirst();

      if (reading.isEmpty()) {
        reading = sensors.stream()
            .filter(sensor -> sensor.kind() == kind)
            .filter(sensor -> entityMatchesPlant(sensor, plantName))
            .findFirst();
      }

      reading.ifPresent(r -> selected.put(kind, r));
    }
    return selected;
  }

  private boolean roomMatches(HaSensorReading reading, String roomId, String roomName) {
    if (roomId != null && !roomId.isBlank() && roomId.equalsIgnoreCase(String.valueOf(reading.areaId()))) {
      return true;
    }
    if (roomName != null && !roomName.isBlank() && reading.areaName() != null) {
      return reading.areaName().equalsIgnoreCase(roomName);
    }
    return false;
  }

  private boolean entityMatchesPlant(HaSensorReading reading, String plantName) {
    if (plantName == null || plantName.isBlank()) {
      return false;
    }
    String lowered = plantName.toLowerCase(Locale.ROOT);
    return reading.entityId().toLowerCase(Locale.ROOT).contains(lowered)
        || reading.friendlyName().toLowerCase(Locale.ROOT).contains(lowered);
  }

  private HaSensorKind detectKind(String entityId, JsonNode attributes) {
    String lowerEntity = entityId.toLowerCase(Locale.ROOT);
    String deviceClass = attributes.path("device_class").asText("").toLowerCase(Locale.ROOT);

    if (lowerEntity.contains("temperature_") || deviceClass.equals("temperature")) {
      return HaSensorKind.TEMPERATURE;
    }
    if (lowerEntity.contains("humidity_") || deviceClass.equals("humidity")) {
      return HaSensorKind.HUMIDITY;
    }
    if (lowerEntity.contains("soil_moisture_") || lowerEntity.contains("soilmoisture") || deviceClass.equals("moisture")) {
      return HaSensorKind.SOIL_MOISTURE;
    }
    if (lowerEntity.contains("illuminance_") || deviceClass.equals("illuminance") || lowerEntity.contains("lux")) {
      return HaSensorKind.ILLUMINANCE;
    }
    return HaSensorKind.OTHER;
  }

  private Double valueFromAttributes(JsonNode attributes, HaSensorKind kind) {
    return switch (kind) {
      case TEMPERATURE -> parseFirst(attributes, List.of("temperature", "current_temperature", "temp"));
      case HUMIDITY -> parseFirst(attributes, List.of("humidity", "relative_humidity"));
      case SOIL_MOISTURE -> parseFirst(attributes, List.of("soil_moisture", "moisture", "soil"));
      case ILLUMINANCE -> parseFirst(attributes, List.of("illuminance", "lux", "light"));
      default -> null;
    };
  }

  private Double parseFirst(JsonNode attributes, List<String> keys) {
    for (String key : keys) {
      JsonNode node = attributes.get(key);
      if (node != null && !node.isNull()) {
        Double value = parseValue(node.asText());
        if (value != null) {
          return value;
        }
      }
    }
    return null;
  }

  private Double parseValue(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    try {
      return Double.parseDouble(raw.replace(',', '.'));
    } catch (Exception ex) {
      return null;
    }
  }

  private String extractAreaName(JsonNode attributes, String entityId) {
    String areaName = attributes.path("area_name").asText("");
    if (!areaName.isBlank()) {
      return areaName;
    }
    String room = attributes.path("room").asText("");
    if (!room.isBlank()) {
      return room;
    }
    String objectId = entityId.replace("sensor.", "");
    int idx = objectId.indexOf('_');
    if (idx > 0) {
      return objectId.substring(0, idx).replace('_', ' ');
    }
    return "Без комнаты";
  }

  private HttpHeaders authHeaders(String token) {
    HttpHeaders headers = new HttpHeaders();
    headers.setBearerAuth(token);
    return headers;
  }

  private RestTemplate restTemplate() {
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(timeoutMs);
    requestFactory.setReadTimeout(timeoutMs);
    return new RestTemplate(requestFactory);
  }

  private String normalizeBaseUrl(String raw) {
    String base = raw == null ? "" : raw.trim();
    if (base.endsWith("/")) {
      base = base.substring(0, base.length() - 1);
    }
    URI.create(base);
    return base;
  }

  private ResponseEntity<String> executeWithRetry(RestTemplate restTemplate,
                                                   String url,
                                                   HttpMethod method,
                                                   HttpEntity<?> requestEntity) {
    int attempts = Math.max(1, retryCount);
    RuntimeException last = null;
    for (int i = 1; i <= attempts; i++) {
      try {
        return restTemplate.exchange(url, method, requestEntity, String.class);
      } catch (RuntimeException ex) {
        last = ex;
        if (i == attempts) {
          break;
        }
        try {
          Thread.sleep(ThreadLocalRandom.current().nextLong(250, 900));
        } catch (InterruptedException interruptedException) {
          Thread.currentThread().interrupt();
          break;
        }
      }
    }
    throw last == null ? new IllegalStateException("Unknown HA request failure") : last;
  }

  private String emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
