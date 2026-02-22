package com.example.plantbot.service;

import com.example.plantbot.util.WeatherData;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class WeatherService {
  private static final Map<String, String> CITY_ALIASES = Map.ofEntries(
      Map.entry("санкт-петербург", "Saint Petersburg"),
      Map.entry("санкт петербург", "Saint Petersburg"),
      Map.entry("питер", "Saint Petersburg"),
      Map.entry("москва", "Moscow"),
      Map.entry("екатеринбург", "Yekaterinburg"),
      Map.entry("нижний новгород", "Nizhny Novgorod")
  );

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

    String key = normalize(city);
    CachedWeather cached = cache.get(key);
    if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return Optional.of(cached.data());
    }

    List<String> candidates = cityCandidates(city);
    for (String candidate : candidates) {
      Optional<WeatherData> data = requestWeather(candidate);
      if (data.isPresent()) {
        long ttlSeconds = Math.max(1, cacheTtlMinutes) * 60L;
        cache.put(key, new CachedWeather(data.get(), Instant.now().plusSeconds(ttlSeconds)));
        return data;
      }
    }

    log.warn("Weather request failed for city='{}': no matches in candidates={}", city, candidates);
    return Optional.empty();
  }

  private Optional<WeatherData> requestWeather(String cityQuery) {
    String encoded = URLEncoder.encode(cityQuery, StandardCharsets.UTF_8);
    String url = String.format("%s?q=%s&appid=%s&units=%s", baseUrl, encoded, apiKey, units);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || response.get("main") == null) {
        return Optional.empty();
      }
      double temp = response.get("main").get("temp").asDouble();
      double humidity = response.get("main").get("humidity").asDouble();
      return Optional.of(new WeatherData(temp, humidity));
    } catch (HttpStatusCodeException ex) {
      if (ex.getStatusCode().value() >= 500) {
        log.warn("Weather API server error for query='{}': {}", cityQuery, ex.getStatusCode());
      }
      return Optional.empty();
    } catch (Exception ex) {
      log.warn("Weather request error for query='{}': {}", cityQuery, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<String> cityCandidates(String city) {
    String original = city.trim();
    String normalized = normalize(original);
    Set<String> values = new LinkedHashSet<>();

    values.add(original);
    values.add(original + ",RU");

    String alias = CITY_ALIASES.get(normalized);
    if (alias != null) {
      values.add(alias);
      values.add(alias + ",RU");
    }

    String translit = transliterateRuToEn(normalized);
    if (!translit.isBlank()) {
      values.add(capitalizeWords(translit));
      values.add(capitalizeWords(translit) + ",RU");
    }

    return new ArrayList<>(values);
  }

  private String normalize(String city) {
    return city.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
  }

  private String capitalizeWords(String text) {
    String[] parts = text.split("\\s+");
    StringBuilder sb = new StringBuilder();
    for (String part : parts) {
      if (part.isBlank()) {
        continue;
      }
      if (!sb.isEmpty()) {
        sb.append(' ');
      }
      sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
    }
    return sb.toString();
  }

  private String transliterateRuToEn(String text) {
    StringBuilder sb = new StringBuilder();
    for (char c : text.toCharArray()) {
      sb.append(switch (c) {
        case 'а' -> "a";
        case 'б' -> "b";
        case 'в' -> "v";
        case 'г' -> "g";
        case 'д' -> "d";
        case 'е', 'ё' -> "e";
        case 'ж' -> "zh";
        case 'з' -> "z";
        case 'и' -> "i";
        case 'й' -> "y";
        case 'к' -> "k";
        case 'л' -> "l";
        case 'м' -> "m";
        case 'н' -> "n";
        case 'о' -> "o";
        case 'п' -> "p";
        case 'р' -> "r";
        case 'с' -> "s";
        case 'т' -> "t";
        case 'у' -> "u";
        case 'ф' -> "f";
        case 'х' -> "h";
        case 'ц' -> "ts";
        case 'ч' -> "ch";
        case 'ш' -> "sh";
        case 'щ' -> "sch";
        case 'ъ', 'ь' -> "";
        case 'ы' -> "y";
        case 'э' -> "e";
        case 'ю' -> "yu";
        case 'я' -> "ya";
        default -> String.valueOf(c);
      });
    }
    return sb.toString().replace('-', ' ').trim();
  }

  private record CachedWeather(WeatherData data, Instant expiresAt) {
  }
}
