package com.example.plantbot.service;

import com.example.plantbot.util.WeatherData;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class WeatherService {
  private final RestTemplate restTemplate;
  private final Map<String, CachedWeather> cache = new ConcurrentHashMap<>();

  @Value("${openweather.api-key}")
  private String apiKey;

  @Value("${openweather.base-url}")
  private String baseUrl;

  @Value("${openweather.units}")
  private String units;

  @Value("${openweather.cache-ttl-minutes:15}")
  private long cacheTtlMinutes;

  public Optional<WeatherData> getCurrent(String city) {
    if (city == null || city.isBlank() || apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }
    String key = city.trim().toLowerCase();
    CachedWeather cached = cache.get(key);
    if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return Optional.of(cached.data());
    }
    String encoded = URLEncoder.encode(city, StandardCharsets.UTF_8);
    String url = String.format("%s?q=%s&appid=%s&units=%s", baseUrl, encoded, apiKey, units);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || response.get("main") == null) {
        return Optional.empty();
      }
      double temp = response.get("main").get("temp").asDouble();
      double humidity = response.get("main").get("humidity").asDouble();
      WeatherData data = new WeatherData(temp, humidity);
      long ttlSeconds = Math.max(1, cacheTtlMinutes) * 60L;
      cache.put(key, new CachedWeather(data, Instant.now().plusSeconds(ttlSeconds)));
      return Optional.of(data);
    } catch (Exception ex) {
      log.warn("Weather request failed for city='{}': {}", city, ex.getMessage());
      return Optional.empty();
    }
  }

  private record CachedWeather(WeatherData data, Instant expiresAt) {
  }
}
