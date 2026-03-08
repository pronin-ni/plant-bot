package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.weather.WeatherCurrentResponse;
import com.example.plantbot.controller.dto.weather.WeatherForecastResponse;
import com.example.plantbot.controller.dto.weather.WeatherProviderResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.UserService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/weather")
@RequiredArgsConstructor
public class WeatherController {

  private final CurrentUserService currentUserService;
  private final UserService userService;
  private final WeatherService weatherService;

  @GetMapping("/providers")
  public WeatherProviderResponse providers(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    List<WeatherProviderResponse.WeatherProviderItem> items = List.of(
        new WeatherProviderResponse.WeatherProviderItem(WeatherProvider.OPEN_METEO.name(), "Open-Meteo", "Без ключей, точные данные", true),
        new WeatherProviderResponse.WeatherProviderItem(WeatherProvider.WEATHERAPI.name(), "WeatherAPI Free", "Публичный ключ на сервере", true),
        new WeatherProviderResponse.WeatherProviderItem(WeatherProvider.TOMORROW.name(), "Tomorrow.io Free", "Публичный ключ на сервере", true),
        new WeatherProviderResponse.WeatherProviderItem(WeatherProvider.OPENWEATHER.name(), "OpenWeatherMap Free", "Публичный ключ на сервере", true)
    );
    return WeatherProviderResponse.of(items, user.getWeatherProvider());
  }

  @PostMapping("/provider")
  public WeatherProviderResponse selectProvider(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody(required = false) ProviderRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    WeatherProvider provider = parseProvider(request == null ? null : request.provider());
    user.setWeatherProvider(provider);
    userService.save(user);
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
    WeatherProvider provider = user.getWeatherProvider() == null ? WeatherProvider.OPEN_METEO : user.getWeatherProvider();
    Optional<WeatherData> data = weatherService.getCurrent(targetCity, user.getCityLat(), user.getCityLon(), provider);
    WeatherData payload = data.orElse(new WeatherData(Double.NaN, Double.NaN, 0.0));
    return new WeatherCurrentResponse(
        targetCity == null ? "" : targetCity,
        payload.temperatureC(),
        payload.humidityPercent(),
        null,
        null,
        provider.name()
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
    WeatherProvider provider = user.getWeatherProvider() == null ? WeatherProvider.OPEN_METEO : user.getWeatherProvider();
    List<WeatherForecastDay> items = weatherService.getForecast(targetCity, user.getCityLat(), user.getCityLon(), days, provider);
    List<WeatherForecastResponse.WeatherForecastDayResponse> mapped = items.stream()
        .map(day -> new WeatherForecastResponse.WeatherForecastDayResponse(
            day.dateIso(),
            day.tempC(),
            day.humidity(),
            day.description()
        ))
        .toList();
    return new WeatherForecastResponse(targetCity == null ? "" : targetCity, provider.name(), mapped);
  }

  private WeatherProvider parseProvider(String raw) {
    if (raw == null || raw.isBlank()) {
      return WeatherProvider.OPEN_METEO;
    }
    try {
      return WeatherProvider.valueOf(raw.trim().toUpperCase());
    } catch (IllegalArgumentException ex) {
      return WeatherProvider.OPEN_METEO;
    }
  }

  public record ProviderRequest(String provider) {
  }
}
