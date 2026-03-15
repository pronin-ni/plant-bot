package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.weather.WeatherCurrentResponse;
import com.example.plantbot.controller.dto.weather.WeatherForecastResponse;
import com.example.plantbot.controller.dto.weather.WeatherProviderResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WeatherProviderStrategy;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

@RestController
@RequestMapping("/api/weather")
@RequiredArgsConstructor
@Slf4j
public class WeatherController {

  private final CurrentUserService currentUserService;
  private final WeatherService weatherService;

  @GetMapping("/providers")
  public WeatherProviderResponse providers(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    currentUserService.resolve(authentication, initData);
    List<WeatherProviderResponse.WeatherProviderItem> items = weatherService.getEnabledProviders().stream()
        .map(provider -> new WeatherProviderResponse.WeatherProviderItem(
            provider.name(),
            providerLabel(provider),
            providerDescription(provider),
            provider == WeatherProvider.OPEN_METEO || provider == WeatherProvider.MET_NORWAY
        ))
        .toList();
    WeatherProvider selected = weatherService.getProviderStrategy() == WeatherProviderStrategy.FIXED
        ? weatherService.getFixedProvider()
        : items.isEmpty() ? WeatherProvider.OPEN_METEO : WeatherProvider.valueOf(items.get(0).id());
    return WeatherProviderResponse.of(items, selected);
  }

  @PostMapping("/provider")
  public WeatherProviderResponse selectProvider(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody(required = false) ProviderRequest request
  ) {
    currentUserService.resolve(authentication, initData);
    String requested = request == null ? null : request.provider();
    log.warn("Ignored deprecated manual weather provider selection request: provider={} strategy={}",
        requested, weatherService.getProviderStrategy());
    return providers(initData, authentication);
  }

  @GetMapping("/current")
  public WeatherCurrentResponse current(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "city", required = false) String city
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String targetCity = city != null && !city.isBlank() ? city : user.getCity();
    if (!hasWeatherLocation(targetCity, user.getCityLat(), user.getCityLon())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Сначала укажите город, чтобы получать погоду");
    }
    var result = weatherService.fetchWeather(targetCity, user.getCityLat(), user.getCityLon(), 3, null);
    Optional<WeatherData> data = Optional.ofNullable(result.current());
    if (data.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
          "Не удалось получить текущую погоду для города: " + (targetCity == null ? "не задан" : targetCity));
    }
    WeatherData payload = data.get();
    return new WeatherCurrentResponse(
        targetCity == null ? "" : targetCity,
        payload.temperatureC(),
        payload.humidityPercent(),
        null,
        null,
        result.providerUsed() == null ? weatherService.getProviderStrategy().name() : result.providerUsed().name(),
        result.fallbackUsed(),
        result.staleFallbackUsed(),
        result.degraded(),
        result.message()
    );
  }

  @GetMapping("/forecast")
  public WeatherForecastResponse forecast(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "city", required = false) String city,
      @RequestParam(name = "days", required = false, defaultValue = "3") int days
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String targetCity = city != null && !city.isBlank() ? city : user.getCity();
    if (!hasWeatherLocation(targetCity, user.getCityLat(), user.getCityLon())) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Сначала укажите город, чтобы получать прогноз погоды");
    }
    var result = weatherService.fetchWeather(targetCity, user.getCityLat(), user.getCityLon(), days, null);
    List<WeatherForecastDay> items = result.forecast() == null ? List.of() : result.forecast();
    if (items.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
          "Не удалось получить прогноз погоды для города: " + (targetCity == null ? "не задан" : targetCity));
    }
    List<WeatherForecastResponse.WeatherForecastDayResponse> mapped = items.stream()
        .map(day -> new WeatherForecastResponse.WeatherForecastDayResponse(
            day.dateIso(),
            day.tempC(),
            day.humidity(),
            day.description()
        ))
        .toList();
    return new WeatherForecastResponse(
        targetCity == null ? "" : targetCity,
        result.providerUsed() == null ? weatherService.getProviderStrategy().name() : result.providerUsed().name(),
        result.fallbackUsed(),
        result.staleFallbackUsed(),
        result.degraded(),
        result.message(),
        mapped
    );
  }

  private String providerLabel(WeatherProvider provider) {
    return switch (provider) {
      case OPEN_METEO -> "Open-Meteo";
      case MET_NORWAY -> "MET Norway";
      case WEATHERAPI -> "WeatherAPI";
      case TOMORROW -> "Tomorrow.io";
      case OPENWEATHER -> "OpenWeatherMap";
    };
  }

  private String providerDescription(WeatherProvider provider) {
    return switch (provider) {
      case OPEN_METEO -> "Бесплатно, без ключей";
      case MET_NORWAY -> "Бесплатно, без ключей";
      case WEATHERAPI -> "Optional keyed provider";
      case TOMORROW -> "Optional keyed provider";
      case OPENWEATHER -> "Legacy keyed provider";
    };
  }

  public record ProviderRequest(String provider) {
  }

  private boolean hasWeatherLocation(String city, Double lat, Double lon) {
    if (lat != null && lon != null) {
      return true;
    }
    if (city == null) {
      return false;
    }
    String normalized = city.trim();
    if (normalized.isBlank()) {
      return false;
    }
    String lowered = normalized.toLowerCase(Locale.ROOT);
    return !"null".equals(lowered) && !"undefined".equals(lowered);
  }
}
