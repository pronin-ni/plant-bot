package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherConfidence;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
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

    WeatherProvider provider = user.getWeatherProvider() == null ? WeatherProvider.OPEN_METEO : user.getWeatherProvider();
    Optional<WeatherData> current = weatherService.getCurrent(city, user.getCityLat(), user.getCityLon(), provider);
    List<WeatherForecastDay> forecast = weatherService.getForecast(city, user.getCityLat(), user.getCityLon(), 3, provider);
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

    // В текущем API провайдеров нет стандартизированного wind-поля и осадков прогноза.
    Double precipForecast = null;
    Double windNow = null;

    List<String> warnings = new ArrayList<>();
    if (current.isEmpty()) {
      warnings.add("Актуальная погода недоступна.");
    }
    if (forecast.isEmpty()) {
      warnings.add("Прогноз на 2-3 дня недоступен.");
    }
    warnings.add("Скорость ветра недоступна в унифицированном API, расчёт без wind-фактора.");
    warnings.add("Осадки прогноза недоступны в унифицированном API, используется история осадков за 24ч.");

    WeatherConfidence confidence;
    if (current.isPresent() && !forecast.isEmpty()) {
      confidence = WeatherConfidence.HIGH;
    } else if (current.isPresent()) {
      confidence = WeatherConfidence.MEDIUM;
    } else {
      confidence = WeatherConfidence.LOW;
    }

    return new NormalizedWeatherContext(
        current.isPresent(),
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
        "%.1f°C, влажность %.0f%%, осадки за 24ч %.1f мм, max t (3д) %s",
        context.temperatureNowC() == null ? 0.0 : context.temperatureNowC(),
        context.humidityNowPercent() == null ? 0.0 : context.humidityNowPercent(),
        context.precipitationLast24hMm() == null ? 0.0 : context.precipitationLast24hMm(),
        context.maxTemperatureNext3DaysC() == null ? "n/a" : String.format(Locale.ROOT, "%.1f°C", context.maxTemperatureNext3DaysC())
    );
  }
}
