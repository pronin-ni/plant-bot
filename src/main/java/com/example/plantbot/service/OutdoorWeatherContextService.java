package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.dto.WeatherFetchResult;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class OutdoorWeatherContextService {
  private final WeatherService weatherService;

  public NormalizedWeatherContext resolve(User user, String cityRaw, String regionRaw) {
    String city = cityRaw != null && !cityRaw.isBlank()
        ? cityRaw.trim()
        : (user.getCity() == null ? "" : user.getCity().trim());
    String region = regionRaw == null ? "" : regionRaw.trim();
    if (city.isBlank()) {
      return new NormalizedWeatherContext(
          false,
          true,
          false,
          false,
          null,
          "",
          region,
          null,
          null,
          null,
          null,
          null,
          null,
          WeatherConfidence.LOW,
          List.of("Город не задан, погодный контекст недоступен.")
      );
    }

    WeatherFetchResult result = weatherService.fetchWeather(city, user.getCityLat(), user.getCityLon(), 3, null);
    Optional<WeatherData> current = Optional.ofNullable(result.current());
    List<WeatherForecastDay> forecast = result.forecast() == null ? List.of() : result.forecast();
    double rain24h = weatherService.getAccumulatedRainMm(city, user.getCityLat(), user.getCityLon(), 24);

    Double maxTempNext3Days = forecast.isEmpty()
        ? null
        : forecast.stream()
            .mapToDouble(WeatherForecastDay::tempC)
            .max()
            .orElse(Double.NaN);
    if (maxTempNext3Days != null && maxTempNext3Days.isNaN()) {
      maxTempNext3Days = null;
    }

    Double precipForecast = forecast.isEmpty()
        ? null
        : forecast.stream()
            .limit(3)
            .map(WeatherForecastDay::precipitationMm)
            .filter(value -> value != null && value > 0.0)
            .mapToDouble(Double::doubleValue)
            .sum();
    if (precipForecast != null && precipForecast <= 0.0) {
      precipForecast = null;
    }

    // В текущем API провайдеров нет стандартизированного wind-поля.
    Double windNow = null;

    List<String> warnings = new ArrayList<>();
    if (current.isEmpty()) {
      warnings.add("Актуальная погода недоступна.");
    }
    if (forecast.isEmpty()) {
      warnings.add("Прогноз на 2-3 дня недоступен.");
    }
    warnings.add("Скорость ветра недоступна в унифицированном API, расчёт без wind-фактора.");
    if (result.fallbackUsed()) {
      warnings.add(result.staleFallbackUsed()
          ? "Использован сохранённый погодный срез, свежий источник временно недоступен."
          : "Основной погодный источник недоступен, использован fallback-провайдер.");
    }
    if (result.degraded() && !result.success()) {
      warnings.add("Погодный контекст работает в degraded mode.");
    }

    WeatherConfidence confidence;
    if (result.degraded() && current.isEmpty()) {
      confidence = WeatherConfidence.LOW;
    } else if (current.isPresent() && !forecast.isEmpty() && !result.staleFallbackUsed()) {
      confidence = WeatherConfidence.HIGH;
    } else if (current.isPresent()) {
      confidence = WeatherConfidence.MEDIUM;
    } else {
      confidence = WeatherConfidence.LOW;
    }

    return new NormalizedWeatherContext(
        current.isPresent(),
        result.degraded(),
        result.fallbackUsed(),
        result.staleFallbackUsed(),
        result.providerUsed(),
        city,
        region,
        current.map(WeatherData::temperatureC).orElse(null),
        current.map(WeatherData::humidityPercent).orElse(null),
        rain24h,
        precipForecast,
        maxTempNext3Days,
        windNow,
        confidence,
        warnings
    );
  }

  public String toPromptSummary(NormalizedWeatherContext context) {
    if (!context.available()) {
      return "нет актуальных погодных данных";
    }
    return String.format(
        Locale.ROOT,
        "%.1f°C, влажность %.0f%%, осадки за 24ч %.1f мм, прогноз осадков 72ч %s, max t (3д) %s",
        context.temperatureNowC() == null ? 0.0 : context.temperatureNowC(),
        context.humidityNowPercent() == null ? 0.0 : context.humidityNowPercent(),
        context.precipitationLast24hMm() == null ? 0.0 : context.precipitationLast24hMm(),
        context.precipitationForecastNext72hMm() == null ? "n/a" : String.format(Locale.ROOT, "%.1f мм", context.precipitationForecastNext72hMm()),
        context.maxTemperatureNext3DaysC() == null ? "n/a" : String.format(Locale.ROOT, "%.1f°C", context.maxTemperatureNext3DaysC())
    );
  }
}
