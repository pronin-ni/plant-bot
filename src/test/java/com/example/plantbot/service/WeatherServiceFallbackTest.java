package com.example.plantbot.service;

import com.example.plantbot.config.WeatherProperties;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WeatherProviderStrategy;
import com.example.plantbot.service.dto.WeatherFetchResult;
import com.example.plantbot.service.weather.WeatherLocationService;
import com.example.plantbot.service.weather.WeatherProviderClient;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class WeatherServiceFallbackTest {

  @Test
  void usesPrimaryProviderWhenOpenMeteoSucceeds() {
    WeatherService service = newService(
        client(WeatherProvider.OPEN_METEO, true, weather(18.5, 55.0, 0.0), forecast("2026-03-15", 19.0, 0.0)),
        client(WeatherProvider.MET_NORWAY, true, null, List.of())
    );

    WeatherFetchResult result = service.fetchWeather("Moscow", null, null, 3, null);

    assertTrue(result.success());
    assertFalse(result.degraded());
    assertFalse(result.fallbackUsed());
    assertFalse(result.staleFallbackUsed());
    assertEquals(WeatherProvider.OPEN_METEO, result.providerUsed());
    assertNotNull(result.current());
    assertEquals(1, result.forecast().size());
  }

  @Test
  void fallsBackToMetNorwayWhenPrimaryFails() {
    WeatherService service = newService(
        client(WeatherProvider.OPEN_METEO, true, null, List.of()),
        client(WeatherProvider.MET_NORWAY, true, weather(16.0, 70.0, 1.2), forecast("2026-03-15", 15.0, 2.5))
    );

    WeatherFetchResult result = service.fetchWeather("Kazan", null, null, 3, null);

    assertTrue(result.success());
    assertFalse(result.degraded());
    assertTrue(result.fallbackUsed());
    assertFalse(result.staleFallbackUsed());
    assertEquals(WeatherProvider.MET_NORWAY, result.providerUsed());
  }

  @Test
  void usesStaleCacheWhenProvidersFailAndCacheIsStillFreshEnough() {
    MutableClient openMeteo = mutableClient(WeatherProvider.OPEN_METEO, true, weather(21.0, 48.0, 0.0), forecast("2026-03-15", 22.0, 0.0));
    MutableClient metNorway = mutableClient(WeatherProvider.MET_NORWAY, true, null, List.of());
    WeatherService service = newService(openMeteo, metNorway);

    WeatherFetchResult first = service.fetchWeather("Sochi", null, null, 3, null);
    assertTrue(first.success());
    assertEquals(WeatherProvider.OPEN_METEO, first.providerUsed());

    openMeteo.setCurrent(null);
    openMeteo.setForecast(List.of());
    expireAutoCacheEntry(service, "Sochi", first.current(), first.forecast(), WeatherProvider.OPEN_METEO);

    WeatherFetchResult stale = service.fetchWeather("Sochi", null, null, 3, null);

    assertTrue(stale.success());
    assertTrue(stale.degraded());
    assertTrue(stale.fallbackUsed());
    assertTrue(stale.staleFallbackUsed());
    assertEquals(WeatherProvider.OPEN_METEO, stale.providerUsed());
  }

  @Test
  void returnsDegradedModeWhenNoProviderAndNoStaleCacheAvailable() {
    WeatherService service = newService(
        client(WeatherProvider.OPEN_METEO, true, null, List.of()),
        client(WeatherProvider.MET_NORWAY, true, null, List.of())
    );

    WeatherFetchResult result = service.fetchWeather("Perm", null, null, 3, null);

    assertFalse(result.success());
    assertTrue(result.degraded());
    assertTrue(result.fallbackUsed());
    assertFalse(result.staleFallbackUsed());
    assertNull(result.providerUsed());
    assertTrue(result.forecast().isEmpty());
  }

  private WeatherService newService(WeatherProviderClient... clients) {
    WeatherProperties properties = new WeatherProperties();
    properties.setProviderStrategy(WeatherProviderStrategy.AUTO);
    properties.setEnabledProviders(List.of(WeatherProvider.OPEN_METEO, WeatherProvider.MET_NORWAY));
    properties.setCacheTtlMinutes(1);
    properties.setStaleFallbackEnabled(true);
    properties.setMaxStaleAgeMinutes(180);
    return new WeatherService(mock(WeatherLocationService.class), properties, List.of(clients), mock(PerformanceMetricsService.class));
  }

  private static WeatherData weather(double temp, double humidity, double precipitation) {
    return new WeatherData(temp, humidity, precipitation);
  }

  private static List<WeatherForecastDay> forecast(String date, double temp, double precipitation) {
    return List.of(new WeatherForecastDay(date, temp, 60.0, precipitation, null));
  }

  private static WeatherProviderClient client(WeatherProvider provider,
                                              boolean enabled,
                                              WeatherData current,
                                              List<WeatherForecastDay> forecast) {
    return new MutableClient(provider, enabled, current, forecast);
  }

  private static MutableClient mutableClient(WeatherProvider provider,
                                             boolean enabled,
                                             WeatherData current,
                                             List<WeatherForecastDay> forecast) {
    return new MutableClient(provider, enabled, current, forecast);
  }

  private static final class MutableClient implements WeatherProviderClient {
    private final WeatherProvider provider;
    private final boolean enabled;
    private WeatherData current;
    private List<WeatherForecastDay> forecast;

    private MutableClient(WeatherProvider provider, boolean enabled, WeatherData current, List<WeatherForecastDay> forecast) {
      this.provider = provider;
      this.enabled = enabled;
      this.current = current;
      this.forecast = forecast;
    }

    @Override
    public WeatherProvider provider() {
      return provider;
    }

    @Override
    public boolean isEnabled() {
      return enabled;
    }

    @Override
    public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
      return Optional.ofNullable(current);
    }

    @Override
    public List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days) {
      return forecast;
    }

    void setCurrent(WeatherData current) {
      this.current = current;
    }

    void setForecast(List<WeatherForecastDay> forecast) {
      this.forecast = forecast;
    }
  }

  @SuppressWarnings("unchecked")
  private void expireAutoCacheEntry(WeatherService service,
                                    String city,
                                    WeatherData current,
                                    List<WeatherForecastDay> forecast,
                                    WeatherProvider provider) {
    try {
      Field cacheField = WeatherService.class.getDeclaredField("cache");
      cacheField.setAccessible(true);
      Map<String, Object> cache = (Map<String, Object>) cacheField.get(service);

      Class<?> cachedWeatherClass = Class.forName("com.example.plantbot.service.WeatherService$CachedWeather");
      Constructor<?> constructor = cachedWeatherClass.getDeclaredConstructor(
          WeatherData.class,
          List.class,
          WeatherProvider.class,
          Instant.class,
          Instant.class
      );
      constructor.setAccessible(true);

      Instant now = Instant.now();
      Object staleEntry = constructor.newInstance(
          current,
          forecast,
          provider,
          now.minusSeconds(30),
          now.minusSeconds(5)
      );
      cache.put("city:sochi:auto", staleEntry);
    } catch (Exception ex) {
      throw new AssertionError("Failed to prepare stale cache test fixture", ex);
    }
  }
}
