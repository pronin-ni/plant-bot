package com.example.plantbot.service.weather;

import com.example.plantbot.config.WeatherProperties;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.util.CityOption;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class MetNorwayWeatherProviderClient implements WeatherProviderClient {
  private final RestTemplate restTemplate;
  private final WeatherLocationService weatherLocationService;
  private final WeatherProperties weatherProperties;

  @Override
  public WeatherProvider provider() {
    return WeatherProvider.MET_NORWAY;
  }

  @Override
  public boolean isEnabled() {
    return weatherProperties.getMetno() != null
        && weatherProperties.getMetno().getBaseUrl() != null
        && !weatherProperties.getMetno().getBaseUrl().isBlank();
  }

  @Override
  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    JsonNode root = loadForecastRoot(city, lat, lon);
    if (root == null) {
      return Optional.empty();
    }
    JsonNode current = root.path("properties").path("timeseries");
    if (!current.isArray() || current.isEmpty()) {
      return Optional.empty();
    }
    JsonNode first = current.get(0);
    JsonNode details = first.path("data").path("instant").path("details");
    double temp = details.path("air_temperature").asDouble(Double.NaN);
    double humidity = details.path("relative_humidity").asDouble(Double.NaN);
    double precipitation = first.path("data").path("next_1_hours").path("details").path("precipitation_amount").asDouble(0.0);
    if (Double.isNaN(temp) || Double.isNaN(humidity)) {
      return Optional.empty();
    }
    return Optional.of(new WeatherData(temp, humidity, Math.max(0.0, precipitation)));
  }

  @Override
  public List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days) {
    int safeDays = Math.max(1, Math.min(days, 7));
    JsonNode root = loadForecastRoot(city, lat, lon);
    if (root == null) {
      return List.of();
    }
    JsonNode timeseries = root.path("properties").path("timeseries");
    if (!timeseries.isArray() || timeseries.isEmpty()) {
      return List.of();
    }

    Map<String, List<Double>> tempsByDay = new LinkedHashMap<>();
    Map<String, List<Double>> humidityByDay = new LinkedHashMap<>();
    Map<String, Double> precipitationByDay = new LinkedHashMap<>();
    for (JsonNode item : timeseries) {
      String time = item.path("time").asText("");
      if (time.length() < 10) {
        continue;
      }
      String dayKey = time.substring(0, 10);
      JsonNode details = item.path("data").path("instant").path("details");
      double temp = details.path("air_temperature").asDouble(Double.NaN);
      double humidity = details.path("relative_humidity").asDouble(Double.NaN);
      if (!Double.isNaN(temp)) {
        tempsByDay.computeIfAbsent(dayKey, key -> new ArrayList<>()).add(temp);
      }
      if (!Double.isNaN(humidity)) {
        humidityByDay.computeIfAbsent(dayKey, key -> new ArrayList<>()).add(humidity);
      }
      double precipitation = readPrecipitation(item);
      if (!Double.isNaN(precipitation) && precipitation > 0.0) {
        precipitationByDay.merge(dayKey, precipitation, Double::sum);
      }
    }

    List<WeatherForecastDay> result = new ArrayList<>();
    for (Map.Entry<String, List<Double>> entry : tempsByDay.entrySet()) {
      double avgTemp = entry.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(Double.NaN);
      if (Double.isNaN(avgTemp)) {
        continue;
      }
      List<Double> humidities = humidityByDay.get(entry.getKey());
      Double avgHumidity = null;
      if (humidities != null && !humidities.isEmpty()) {
        double computed = humidities.stream().mapToDouble(Double::doubleValue).average().orElse(Double.NaN);
        if (!Double.isNaN(computed)) {
          avgHumidity = computed;
        }
      }
      result.add(new WeatherForecastDay(
          entry.getKey(),
          avgTemp,
          avgHumidity,
          precipitationByDay.get(entry.getKey()),
          null
      ));
      if (result.size() >= safeDays) {
        break;
      }
    }
    return result;
  }

  private JsonNode loadForecastRoot(String city, Double lat, Double lon) {
    try {
      CityOption location = weatherLocationService.resolveForecastLocation(lat, lon, city);
      if (location == null) {
        return null;
      }
      String url = String.format(Locale.ROOT, "%s?lat=%.6f&lon=%.6f", weatherProperties.getMetno().getBaseUrl(), location.lat(), location.lon());
      HttpHeaders headers = new HttpHeaders();
      headers.set(HttpHeaders.USER_AGENT, weatherProperties.getMetno().getUserAgent());
      headers.setAccept(List.of(MediaType.APPLICATION_JSON));
      ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
      return response.getBody();
    } catch (Exception ex) {
      log.debug("MET Norway request failed for city='{}': {}", city, ex.getMessage());
      return null;
    }
  }

  private double readPrecipitation(JsonNode item) {
    double next6 = item.path("data").path("next_6_hours").path("details").path("precipitation_amount").asDouble(Double.NaN);
    if (!Double.isNaN(next6)) {
      return Math.max(0.0, next6);
    }
    double next1 = item.path("data").path("next_1_hours").path("details").path("precipitation_amount").asDouble(Double.NaN);
    if (!Double.isNaN(next1)) {
      return Math.max(0.0, next1);
    }
    return Double.NaN;
  }
}
