package com.example.plantbot.service.weather;

import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.util.CityOption;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class OpenMeteoWeatherProviderClient implements WeatherProviderClient {
  private final RestTemplate restTemplate;
  private final WeatherLocationService weatherLocationService;

  @Value("${openmeteo.enabled:true}")
  private boolean openMeteoEnabled;

  @Value("${openmeteo.base-url:https://api.open-meteo.com/v1/forecast}")
  private String openMeteoBaseUrl;

  @Override
  public WeatherProvider provider() {
    return WeatherProvider.OPEN_METEO;
  }

  @Override
  public boolean isEnabled() {
    return openMeteoEnabled;
  }

  @Override
  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    Optional<WeatherData> byCoords = requestByCoords(lat, lon, city);
    if (byCoords.isPresent()) {
      return byCoords;
    }
    if (city == null || city.isBlank()) {
      return Optional.empty();
    }
    CityOption resolved = weatherLocationService.resolveForecastLocation(null, null, city);
    if (resolved == null) {
      return Optional.empty();
    }
    return requestByCoords(resolved.lat(), resolved.lon(), city);
  }

  @Override
  public List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days) {
    int safeDays = Math.max(1, Math.min(days, 7));
    try {
      CityOption resolvedCity = weatherLocationService.resolveForecastLocation(lat, lon, city);
      if (resolvedCity == null) {
        return List.of();
      }
      String url = String.format(Locale.ROOT,
          "%s?latitude=%.6f&longitude=%.6f&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum&timezone=auto&forecast_days=%d",
          openMeteoBaseUrl, resolvedCity.lat(), resolvedCity.lon(), safeDays);
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode daily = response == null ? null : response.path("daily");
      if (daily == null || daily.isMissingNode()) {
        return List.of();
      }
      JsonNode dates = daily.path("time");
      JsonNode tMax = daily.path("temperature_2m_max");
      JsonNode tMin = daily.path("temperature_2m_min");
      JsonNode humidity = daily.path("relative_humidity_2m_mean");
      JsonNode precipitation = daily.path("precipitation_sum");
      int len = dates.size();
      List<WeatherForecastDay> list = new ArrayList<>();
      for (int i = 0; i < len; i++) {
        String dateIso = dates.get(i).asText("");
        double max = tMax.path(i).asDouble(Double.NaN);
        double min = tMin.path(i).asDouble(Double.NaN);
        double hum = humidity.path(i).asDouble(Double.NaN);
        double precip = precipitation.path(i).asDouble(Double.NaN);
        if (dateIso.isEmpty() || Double.isNaN(max) || Double.isNaN(min)) {
          continue;
        }
        double avg = (max + min) / 2.0;
        list.add(new WeatherForecastDay(
            dateIso,
            avg,
            Double.isNaN(hum) ? null : hum,
            Double.isNaN(precip) ? null : Math.max(0.0, precip),
            null
        ));
        if (list.size() >= safeDays) {
          break;
        }
      }
      return list;
    } catch (Exception ex) {
      log.debug("Open-Meteo forecast failed for city='{}': {}", city, ex.getMessage());
      return List.of();
    }
  }

  private Optional<WeatherData> requestByCoords(Double lat, Double lon, String debug) {
    if (lat == null || lon == null) {
      return Optional.empty();
    }
    String url = String.format(Locale.ROOT,
        "%s?latitude=%.6f&longitude=%.6f&current=temperature_2m,relative_humidity_2m,precipitation&timezone=auto",
        openMeteoBaseUrl, lat, lon);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode current = response == null ? null : response.path("current");
      if (current == null || current.isMissingNode()) {
        return Optional.empty();
      }
      double temp = current.path("temperature_2m").asDouble(Double.NaN);
      double humidity = current.path("relative_humidity_2m").asDouble(Double.NaN);
      double rain = current.path("precipitation").asDouble(0.0);
      if (Double.isNaN(temp) || Double.isNaN(humidity)) {
        return Optional.empty();
      }
      return Optional.of(new WeatherData(temp, humidity, Math.max(0.0, rain)));
    } catch (Exception ex) {
      log.debug("Open-Meteo request error for '{}': {}", debug, ex.getMessage());
      return Optional.empty();
    }
  }
}
