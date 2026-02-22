package com.example.plantbot.service;

import com.example.plantbot.util.CityOption;
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
  private final Map<String, List<RainSample>> rainHistory = new ConcurrentHashMap<>();

  @Value("${openweather.api-key}")
  private String apiKey;

  @Value("${openweather.base-url}")
  private String baseUrl;

  @Value("${openweather.geo-base-url:https://api.openweathermap.org/geo/1.0/direct}")
  private String geoBaseUrl;

  @Value("${openweather.geo-reverse-base-url:https://api.openweathermap.org/geo/1.0/reverse}")
  private String geoReverseBaseUrl;

  @Value("${openweather.units}")
  private String units;

  @Value("${openweather.cache-ttl-minutes:15}")
  private long cacheTtlMinutes;

  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    if (apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }

    String key = cacheKey(city, lat, lon);
    CachedWeather cached = cache.get(key);
    if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return Optional.of(cached.data());
    }

    Optional<WeatherData> fromCoords = requestWeatherByCoords(lat, lon);
    if (fromCoords.isPresent()) {
      return storeWeather(key, fromCoords.get());
    }

    Optional<WeatherData> fromCity = requestWeatherByCityCandidates(city);
    if (fromCity.isPresent()) {
      return storeWeather(key, fromCity.get());
    }

    log.warn("Weather request failed for city='{}' lat={} lon={}", city, lat, lon);
    return Optional.empty();
  }

  public Optional<WeatherData> getCurrent(String city) {
    return getCurrent(city, null, null);
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
    if (query == null || query.isBlank() || apiKey == null || apiKey.isBlank()) {
      return List.of();
    }
    int max = Math.max(1, Math.min(8, limit));
    Set<String> candidates = new LinkedHashSet<>(cityCandidates(query));
    List<CityOption> result = new ArrayList<>();
    for (String candidate : candidates) {
      if (result.size() >= max) {
        break;
      }
      result.addAll(fetchGeoCandidates(candidate, max - result.size()));
    }

    // deduplicate by rounded lat/lon
    Set<String> seen = new LinkedHashSet<>();
    List<CityOption> unique = new ArrayList<>();
    for (CityOption option : result) {
      String id = String.format(Locale.ROOT, "%.4f:%.4f", option.lat(), option.lon());
      if (seen.add(id)) {
        unique.add(option);
      }
      if (unique.size() >= max) {
        break;
      }
    }
    return unique;
  }

  public Optional<CityOption> resolveCityByCoordinates(Double lat, Double lon) {
    if (lat == null || lon == null || apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }
    try {
      String url = String.format(Locale.ROOT, "%s?lat=%.6f&lon=%.6f&limit=1&appid=%s",
          geoReverseBaseUrl, lat, lon, apiKey);
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || !response.isArray() || response.isEmpty()) {
        return Optional.empty();
      }
      JsonNode node = response.get(0);
      String name = node.path("name").asText("").trim();
      String state = node.path("state").asText("").trim();
      String country = node.path("country").asText("").trim();
      if (name.isEmpty()) {
        return Optional.empty();
      }
      String display = name;
      if (!state.isEmpty()) {
        display += ", " + state;
      }
      if (!country.isEmpty()) {
        display += ", " + country;
      }
      return Optional.of(new CityOption(display, lat, lon, country));
    } catch (Exception ex) {
      log.warn("Reverse geocoding failed for lat={} lon={}: {}", lat, lon, ex.getMessage());
      return Optional.empty();
    }
  }

  private Optional<WeatherData> storeWeather(String key, WeatherData data) {
    appendRainHistory(key, data.precipitationMm1h());
    long ttlSeconds = Math.max(1, cacheTtlMinutes) * 60L;
    cache.put(key, new CachedWeather(data, Instant.now().plusSeconds(ttlSeconds)));
    return Optional.of(data);
  }

  private Optional<WeatherData> requestWeatherByCoords(Double lat, Double lon) {
    if (lat == null || lon == null) {
      return Optional.empty();
    }
    String url = String.format(Locale.ROOT, "%s?lat=%.6f&lon=%.6f&appid=%s&units=%s", baseUrl, lat, lon, apiKey, units);
    return executeWeatherRequest(url, "lat/lon");
  }

  private Optional<WeatherData> requestWeatherByCityCandidates(String city) {
    if (city == null || city.isBlank()) {
      return Optional.empty();
    }
    for (String candidate : cityCandidates(city)) {
      String encoded = URLEncoder.encode(candidate, StandardCharsets.UTF_8);
      String url = String.format("%s?q=%s&appid=%s&units=%s", baseUrl, encoded, apiKey, units);
      Optional<WeatherData> data = executeWeatherRequest(url, candidate);
      if (data.isPresent()) {
        return data;
      }
    }
    return Optional.empty();
  }

  private Optional<WeatherData> executeWeatherRequest(String url, String debugName) {
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || response.get("main") == null) {
        return Optional.empty();
      }
      double temp = response.path("main").path("temp").asDouble();
      double humidity = response.path("main").path("humidity").asDouble();
      double rain = response.path("rain").path("1h").asDouble(0.0);
      double snow = response.path("snow").path("1h").asDouble(0.0);
      return Optional.of(new WeatherData(temp, humidity, rain + snow));
    } catch (HttpStatusCodeException ex) {
      if (ex.getStatusCode().value() >= 500) {
        log.warn("Weather API server error for '{}': {}", debugName, ex.getStatusCode());
      }
      return Optional.empty();
    } catch (Exception ex) {
      log.warn("Weather request error for '{}': {}", debugName, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<CityOption> fetchGeoCandidates(String cityQuery, int limit) {
    try {
      String encoded = URLEncoder.encode(cityQuery, StandardCharsets.UTF_8);
      String url = String.format("%s?q=%s&limit=%d&appid=%s", geoBaseUrl, encoded, limit, apiKey);
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || !response.isArray()) {
        return List.of();
      }
      List<CityOption> list = new ArrayList<>();
      for (JsonNode node : response) {
        String name = node.path("name").asText("").trim();
        String state = node.path("state").asText("").trim();
        String country = node.path("country").asText("").trim();
        double lat = node.path("lat").asDouble(Double.NaN);
        double lon = node.path("lon").asDouble(Double.NaN);
        if (name.isEmpty() || Double.isNaN(lat) || Double.isNaN(lon)) {
          continue;
        }
        String display = name;
        if (!state.isEmpty()) {
          display += ", " + state;
        }
        if (!country.isEmpty()) {
          display += ", " + country;
        }
        list.add(new CityOption(display, lat, lon, country));
      }
      return list;
    } catch (Exception ex) {
      log.warn("City geocoding failed for '{}': {}", cityQuery, ex.getMessage());
      return List.of();
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

  private String cacheKey(String city, Double lat, Double lon) {
    if (lat != null && lon != null) {
      return String.format(Locale.ROOT, "geo:%.5f:%.5f", lat, lon);
    }
    return "city:" + normalize(city == null ? "" : city);
  }

  private String normalize(String city) {
    return city.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
  }

  private void appendRainHistory(String key, double mmPerHour) {
    rainHistory.computeIfAbsent(key, k -> new ArrayList<>()).add(new RainSample(Instant.now(), mmPerHour));
    pruneRainHistory(key);
  }

  private void pruneRainHistory(String key) {
    List<RainSample> samples = rainHistory.get(key);
    if (samples == null) {
      return;
    }
    Instant cutoff = Instant.now().minusSeconds(72 * 3600L);
    samples.removeIf(sample -> sample.at().isBefore(cutoff));
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

  private record RainSample(Instant at, double mmPerHour) {
  }
}
