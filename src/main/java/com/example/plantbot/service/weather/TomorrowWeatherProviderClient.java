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
public class TomorrowWeatherProviderClient implements WeatherProviderClient {
  private final RestTemplate restTemplate;
  private final WeatherLocationService weatherLocationService;
  private final WeatherProperties weatherProperties;

  @Override
  public WeatherProvider provider() {
    return WeatherProvider.TOMORROW;
  }

  @Override
  public boolean isEnabled() {
    return weatherProperties.getTomorrow() != null
        && weatherProperties.getTomorrow().getApiKey() != null
        && !weatherProperties.getTomorrow().getApiKey().isBlank()
        && weatherProperties.getTomorrow().getRealtimeUrl() != null
        && !weatherProperties.getTomorrow().getRealtimeUrl().isBlank()
        && weatherProperties.getTomorrow().getForecastUrl() != null
        && !weatherProperties.getTomorrow().getForecastUrl().isBlank();
  }

  @Override
  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    if (!isEnabled()) {
      return Optional.empty();
    }
    try {
      String location = resolveLocationQuery(city, lat, lon);
      String url = String.format(
          "%s?location=%s&apikey=%s&units=metric",
          weatherProperties.getTomorrow().getRealtimeUrl(),
          encode(location),
          encode(weatherProperties.getTomorrow().getApiKey())
      );
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode values = response == null ? null : response.path("data").path("values");
      if (values == null || values.isMissingNode()) {
        return Optional.empty();
      }
      double temp = values.path("temperature").asDouble(Double.NaN);
      double humidity = values.path("humidity").asDouble(Double.NaN);
      double precipitation = values.path("precipitationIntensity").asDouble(0.0);
      if (Double.isNaN(temp) || Double.isNaN(humidity)) {
        return Optional.empty();
      }
      return Optional.of(new WeatherData(temp, humidity, Math.max(0.0, precipitation)));
    } catch (Exception ex) {
      log.debug("Tomorrow.io realtime failed for city='{}': {}", city, ex.getMessage());
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
          "%s?location=%s&apikey=%s&timesteps=1d&units=metric",
          weatherProperties.getTomorrow().getForecastUrl(),
          encode(location),
          encode(weatherProperties.getTomorrow().getApiKey())
      );
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode daily = response == null ? null : response.path("timelines").path("daily");
      if (daily == null || !daily.isArray()) {
        return List.of();
      }
      List<WeatherForecastDay> result = new ArrayList<>();
      for (JsonNode item : daily) {
        String time = item.path("time").asText("");
        JsonNode values = item.path("values");
        double tempAvg = values.path("temperatureAvg").asDouble(Double.NaN);
        if (Double.isNaN(tempAvg)) {
          tempAvg = values.path("temperatureMax").asDouble(Double.NaN);
        }
        double humidityAvg = values.path("humidityAvg").asDouble(Double.NaN);
        double precipitationSum = values.path("precipitationIntensityAvg").asDouble(Double.NaN);
        String description = normalizeWeatherCode(values.path("weatherCodeMax").asInt(-1));
        if (time.length() < 10 || Double.isNaN(tempAvg)) {
          continue;
        }
        result.add(new WeatherForecastDay(
            time.substring(0, 10),
            tempAvg,
            Double.isNaN(humidityAvg) ? null : humidityAvg,
            Double.isNaN(precipitationSum) ? null : Math.max(0.0, precipitationSum),
            description
        ));
        if (result.size() >= safeDays) {
          break;
        }
      }
      return result;
    } catch (Exception ex) {
      log.debug("Tomorrow.io forecast failed for city='{}': {}", city, ex.getMessage());
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

  private String normalizeWeatherCode(int code) {
    return switch (code) {
      case 1000 -> "Ясно";
      case 1001 -> "Облачно";
      case 1100, 1101, 1102 -> "Переменная облачность";
      case 4000, 4001, 4200, 4201 -> "Дождь";
      case 5000, 5001, 5100, 5101 -> "Снег";
      case 8000 -> "Гроза";
      default -> null;
    };
  }
}
