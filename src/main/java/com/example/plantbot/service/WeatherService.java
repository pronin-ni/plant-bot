package com.example.plantbot.service;

import com.example.plantbot.config.WeatherProperties;
import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WeatherProviderStrategy;
import com.example.plantbot.service.dto.WeatherFetchResult;
import com.example.plantbot.service.weather.WeatherLocationService;
import com.example.plantbot.service.weather.WeatherProviderClient;
import com.example.plantbot.util.CityOption;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class WeatherService {
  private final WeatherLocationService weatherLocationService;
  private final WeatherProperties weatherProperties;
  private final List<WeatherProviderClient> providerClients;

  private final Map<String, CachedWeather> cache = new ConcurrentHashMap<>();
  private final Map<String, List<RainSample>> rainHistory = new ConcurrentHashMap<>();

  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    return getCurrent(city, lat, lon, null);
  }

  public Optional<WeatherData> getCurrent(String city) {
    return getCurrent(city, null, null, null);
  }

  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon, WeatherProvider requestedProvider) {
    WeatherFetchResult result = fetchWeather(city, lat, lon, 1, requestedProvider);
    return Optional.ofNullable(result.current());
  }

  public List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days, WeatherProvider requestedProvider) {
    WeatherFetchResult result = fetchWeather(city, lat, lon, days, requestedProvider);
    return result.forecast() == null ? List.of() : result.forecast();
  }

  public WeatherFetchResult fetchWeather(String city, Double lat, Double lon, int days, WeatherProvider requestedProvider) {
    int safeDays = Math.max(1, Math.min(days, 7));
    ProviderPlan plan = resolvePlan(requestedProvider);
    String key = cacheKey(city, lat, lon) + ":" + plan.cacheKey();
    Instant now = Instant.now();
    CachedWeather cached = cache.get(key);
    if (cached != null && cached.expiresAt().isAfter(now)) {
      return new WeatherFetchResult(
          true,
          false,
          false,
          false,
          cached.providerUsed(),
          plan.primary(),
          cached.current(),
          cached.forecast(),
          cached.observedAt(),
          "fresh-cache"
      );
    }

    WeatherProvider usedProvider = null;
    WeatherData current = null;
    List<WeatherForecastDay> forecast = List.of();
    boolean fallbackUsed = false;
    boolean hadPrimaryFailure = false;

    for (int i = 0; i < plan.providers().size(); i++) {
      WeatherProvider provider = plan.providers().get(i);
      WeatherProviderClient client = providerClient(provider);
      if (client == null || !client.isEnabled()) {
        continue;
      }

      Optional<WeatherData> currentCandidate = client.getCurrent(city, lat, lon);
      List<WeatherForecastDay> forecastCandidate = client.getForecast(city, lat, lon, safeDays);
      if (currentCandidate.isPresent() || !forecastCandidate.isEmpty()) {
        usedProvider = provider;
        current = currentCandidate.orElse(null);
        forecast = forecastCandidate;
        fallbackUsed = i > 0 || hadPrimaryFailure;
        storeWeather(key, provider, current, forecast, now);
        log.info("Weather fetch success city='{}' provider={} fallbackUsed={} staleFallback=false current={} forecastDays={}",
            city, provider, fallbackUsed, current != null, forecast.size());
        return new WeatherFetchResult(
            true,
            false,
            fallbackUsed,
            false,
            provider,
            plan.primary(),
            current,
            forecast,
            now,
            fallbackUsed ? "provider-fallback" : "provider-success"
        );
      }

      if (i == 0) {
        hadPrimaryFailure = true;
      }
      log.warn("Weather fetch failed for city='{}' provider={} -> trying next fallback", city, provider);
    }

    if (weatherProperties.isStaleFallbackEnabled() && cached != null && cached.observedAt().plusSeconds(Math.max(1, weatherProperties.getMaxStaleAgeMinutes()) * 60L).isAfter(now)) {
      log.warn("Weather fetch stale fallback city='{}' provider={} ageMinutes={}",
          city, cached.providerUsed(),
          Math.max(0, (now.getEpochSecond() - cached.observedAt().getEpochSecond()) / 60));
      return new WeatherFetchResult(
          true,
          true,
          true,
          true,
          cached.providerUsed(),
          plan.primary(),
          cached.current(),
          cached.forecast(),
          cached.observedAt(),
          "stale-cache-fallback"
      );
    }

    log.error("Weather fetch degraded city='{}' primary={} providersTried={} no fresh or stale fallback available",
        city, plan.primary(), plan.providers());
    return new WeatherFetchResult(
        false,
        true,
        plan.providers().size() > 1,
        false,
        null,
        plan.primary(),
        null,
        List.of(),
        now,
        "degraded-no-weather"
    );
  }

  public double getAccumulatedRainMm(String city, Double lat, Double lon, int hours) {
    if (hours <= 0) {
      return 0.0;
    }
    String key = cacheKey(city, lat, lon);
    pruneRainHistory(key);
    List<RainSample> samples = rainHistory.get(key);
    if (samples == null || samples.isEmpty()) {
      return 0.0;
    }
    Instant cutoff = Instant.now().minusSeconds(hours * 3600L);
    double total = 0.0;
    for (RainSample sample : samples) {
      if (sample.at().isAfter(cutoff)) {
        total += Math.max(0.0, sample.mmPerHour());
      }
    }
    return total;
  }

  public List<CityOption> resolveCityOptions(String query, int limit) {
    return weatherLocationService.resolveCityOptions(query, limit);
  }

  public Optional<CityOption> resolveCityByCoordinates(Double lat, Double lon) {
    return weatherLocationService.resolveCityByCoordinates(lat, lon);
  }

  public WeatherProviderStrategy getProviderStrategy() {
    return weatherProperties.getProviderStrategy();
  }

  public WeatherProvider getFixedProvider() {
    return weatherProperties.getFixedProvider();
  }

  public List<WeatherProvider> getEnabledProviders() {
    return new ArrayList<>(weatherProperties.getEnabledProviders());
  }

  private ProviderPlan resolvePlan(WeatherProvider requestedProvider) {
    List<WeatherProvider> configured = enabledConfiguredProviders();
    if (requestedProvider != null) {
      return new ProviderPlan(List.of(requestedProvider), "requested:" + requestedProvider.name());
    }
    if (weatherProperties.getProviderStrategy() == WeatherProviderStrategy.FIXED) {
      WeatherProvider fixed = weatherProperties.getFixedProvider();
      if (configured.contains(fixed)) {
        return new ProviderPlan(List.of(fixed), "fixed:" + fixed.name());
      }
    }
    return new ProviderPlan(configured, "auto");
  }

  private List<WeatherProvider> enabledConfiguredProviders() {
    List<WeatherProvider> configured = weatherProperties.getEnabledProviders();
    if (configured == null || configured.isEmpty()) {
      return List.of(WeatherProvider.OPEN_METEO, WeatherProvider.MET_NORWAY);
    }
    List<WeatherProvider> result = new ArrayList<>();
    for (WeatherProvider provider : configured) {
      WeatherProviderClient client = providerClient(provider);
      if (client != null && client.isEnabled()) {
        result.add(provider);
      }
    }
    if (result.isEmpty()) {
      WeatherProviderClient openMeteo = providerClient(WeatherProvider.OPEN_METEO);
      if (openMeteo != null && openMeteo.isEnabled()) {
        result.add(WeatherProvider.OPEN_METEO);
      }
    }
    return result;
  }

  private WeatherProviderClient providerClient(WeatherProvider provider) {
    for (WeatherProviderClient client : providerClients) {
      if (client.provider() == provider) {
        return client;
      }
    }
    return null;
  }

  private Optional<WeatherData> storeWeather(String key, WeatherProvider provider, WeatherData current, List<WeatherForecastDay> forecast, Instant observedAt) {
    WeatherData data = current;
    if (data != null) {
      appendRainHistory(cacheKeyOnlyLocation(key), data.precipitationMm1h());
    }
    long ttlSeconds = Math.max(1, weatherProperties.getCacheTtlMinutes()) * 60L;
    cache.put(key, new CachedWeather(current, forecast == null ? List.of() : forecast, provider, observedAt, observedAt.plusSeconds(ttlSeconds)));
    enforceWeatherCacheLimit();
    return Optional.ofNullable(data);
  }

  private String cacheKey(String city, Double lat, Double lon) {
    if (lat != null && lon != null) {
      return String.format(Locale.ROOT, "geo:%.5f:%.5f", lat, lon);
    }
    String normalized = city == null ? "" : city.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
    return "city:" + normalized;
  }

  private String cacheKeyOnlyLocation(String key) {
    int idx = key.lastIndexOf(':');
    return idx > 0 ? key.substring(0, idx) : key;
  }

  private void appendRainHistory(String key, double mmPerHour) {
    rainHistory.computeIfAbsent(key, k -> new ArrayList<>()).add(new RainSample(Instant.now(), mmPerHour));
    pruneRainHistory(key);
    enforceRainHistoryLimit();
  }

  private void pruneRainHistory(String key) {
    List<RainSample> samples = rainHistory.get(key);
    if (samples == null) {
      return;
    }
    Instant cutoff = Instant.now().minusSeconds(72 * 3600L);
    samples.removeIf(sample -> sample.at().isBefore(cutoff));
  }

  private void enforceWeatherCacheLimit() {
    cache.entrySet().removeIf(entry -> entry.getValue() == null || entry.getValue().expiresAt().isBefore(Instant.now()));
    int max = 500;
    if (cache.size() <= max) {
      return;
    }
    int toRemove = cache.size() - max;
    List<String> keys = new ArrayList<>(cache.keySet());
    for (int i = 0; i < toRemove && i < keys.size(); i++) {
      cache.remove(keys.get(i));
    }
  }

  private void enforceRainHistoryLimit() {
    int max = 500;
    if (rainHistory.size() <= max) {
      return;
    }
    int toRemove = rainHistory.size() - max;
    List<String> keys = new ArrayList<>(rainHistory.keySet());
    for (int i = 0; i < toRemove && i < keys.size(); i++) {
      rainHistory.remove(keys.get(i));
    }
  }

  public CacheClearStats clearCaches() {
    int weatherEntries = cache.size();
    int rainKeys = rainHistory.size();
    int rainSamples = rainHistory.values().stream().mapToInt(List::size).sum();
    cache.clear();
    rainHistory.clear();
    return new CacheClearStats(weatherEntries, rainKeys, rainSamples);
  }

  public record CacheClearStats(int weatherEntries, int rainKeys, int rainSamples) {
  }

  private record ProviderPlan(List<WeatherProvider> providers, String cacheKey) {
    WeatherProvider primary() {
      return providers.isEmpty() ? WeatherProvider.OPEN_METEO : providers.get(0);
    }
  }

  private record CachedWeather(WeatherData current,
                               List<WeatherForecastDay> forecast,
                               WeatherProvider providerUsed,
                               Instant observedAt,
                               Instant expiresAt) {
  }

  private record RainSample(Instant at, double mmPerHour) {
  }
}
