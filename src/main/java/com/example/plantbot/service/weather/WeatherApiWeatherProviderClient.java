package com.example.plantbot.service.weather;

import com.example.plantbot.config.WeatherProperties;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.util.CityOption;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class WeatherApiWeatherProviderClient implements WeatherProviderClient {
  private final RestTemplate restTemplate;
  private final WeatherLocationService weatherLocationService;
  private final WeatherProperties weatherProperties;

  @Override
  public WeatherProvider provider() {
    return WeatherProvider.WEATHERAPI;
  }

  @Override
  public boolean isEnabled() {
    return weatherProperties.getWeatherapi() != null
        && weatherProperties.getWeatherapi().getApiKey() != null
        && !weatherProperties.getWeatherapi().getApiKey().isBlank()
        && weatherProperties.getWeatherapi().getCurrentUrl() != null
        && !weatherProperties.getWeatherapi().getCurrentUrl().isBlank()
        && weatherProperties.getWeatherapi().getForecastUrl() != null
        && !weatherProperties.getWeatherapi().getForecastUrl().isBlank();
  }

  @Override
  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    if (!isEnabled()) {
      return Optional.empty();
    }
    try {
      String location = resolveLocationQuery(city, lat, lon);
      String url = String.format(
          "%s?key=%s&q=%s&aqi=no",
          weatherProperties.getWeatherapi().getCurrentUrl(),
          encode(weatherProperties.getWeatherapi().getApiKey()),
          encode(location)
      );
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode current = response == null ? null : response.path("current");
      if (current == null || current.isMissingNode()) {
        return Optional.empty();
      }
      double temp = current.path("temp_c").asDouble(Double.NaN);
      double humidity = current.path("humidity").asDouble(Double.NaN);
      double precipitation = current.path("precip_mm").asDouble(0.0);
      if (Double.isNaN(temp) || Double.isNaN(humidity)) {
        return Optional.empty();
      }
      return Optional.of(new WeatherData(temp, humidity, Math.max(0.0, precipitation)));
    } catch (Exception ex) {
      log.debug("WeatherAPI current failed for city='{}': {}", city, ex.getMessage());
      return Optional.empty();
    }
  }

  @Override
  public List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days) {
    if (!isEnabled()) {
      return List.of();
    }
    int safeDays = Math.max(1, Math.min(days, 7));
    try {
      String location = resolveLocationQuery(city, lat, lon);
      String url = String.format(
          "%s?key=%s&q=%s&days=%d&aqi=no&alerts=no",
          weatherProperties.getWeatherapi().getForecastUrl(),
          encode(weatherProperties.getWeatherapi().getApiKey()),
          encode(location),
          safeDays
      );
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode items = response == null ? null : response.path("forecast").path("forecastday");
      if (items == null || !items.isArray()) {
        return List.of();
      }
      List<WeatherForecastDay> result = new ArrayList<>();
      for (JsonNode item : items) {
        String date = item.path("date").asText("");
        JsonNode day = item.path("day");
        double avgTemp = day.path("avgtemp_c").asDouble(Double.NaN);
        double humidity = day.path("avghumidity").asDouble(Double.NaN);
        double precipitation = day.path("totalprecip_mm").asDouble(Double.NaN);
        String description = day.path("condition").path("text").asText(null);
        if (date.isBlank() || Double.isNaN(avgTemp)) {
          continue;
        }
        result.add(new WeatherForecastDay(
            date,
            avgTemp,
            Double.isNaN(humidity) ? null : humidity,
            Double.isNaN(precipitation) ? null : Math.max(0.0, precipitation),
            description
        ));
        if (result.size() >= safeDays) {
          break;
        }
      }
      return result;
    } catch (Exception ex) {
      log.debug("WeatherAPI forecast failed for city='{}': {}", city, ex.getMessage());
      return List.of();
    }
  }

  private String resolveLocationQuery(String city, Double lat, Double lon) {
    if (lat != null && lon != null) {
      return String.format(Locale.ROOT, "%.6f,%.6f", lat, lon);
    }
    CityOption location = weatherLocationService.resolveForecastLocation(lat, lon, city);
    if (location != null) {
      return String.format(Locale.ROOT, "%.6f,%.6f", location.lat(), location.lon());
    }
    return city == null ? "" : city.trim();
  }

  private String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }
}
