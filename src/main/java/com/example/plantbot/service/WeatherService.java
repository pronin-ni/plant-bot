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

  @Value("${openmeteo.enabled:true}")
  private boolean openMeteoEnabled;

  @Value("${openmeteo.base-url:https://api.open-meteo.com/v1/forecast}")
  private String openMeteoBaseUrl;

  @Value("${openmeteo.geocode-base-url:https://geocoding-api.open-meteo.com/v1/search}")
  private String openMeteoGeoBaseUrl;

  @Value("${openmeteo.geocode-reverse-base-url:https://geocoding-api.open-meteo.com/v1/reverse}")
  private String openMeteoGeoReverseBaseUrl;

  @Value("${openweather.api-key:}")
  private String apiKey;

  @Value("${openweather.base-url:https://api.openweathermap.org/data/2.5/weather}")
  private String baseUrl;

  @Value("${openweather.geo-base-url:https://api.openweathermap.org/geo/1.0/direct}")
  private String geoBaseUrl;

  @Value("${openweather.geo-reverse-base-url:https://api.openweathermap.org/geo/1.0/reverse}")
  private String geoReverseBaseUrl;

  @Value("${openweather.units:metric}")
  private String units;

  @Value("${openweather.cache-ttl-minutes:15}")
  private long cacheTtlMinutes;

  @Value("${openweather.cache-max-entries:500}")
  private int cacheMaxEntries;

  @Value("${openweather.rain-max-keys:500}")
  private int rainMaxKeys;

  public Optional<WeatherData> getCurrent(String city, Double lat, Double lon) {
    String key = cacheKey(city, lat, lon);
    CachedWeather cached = cache.get(key);
    if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return Optional.of(cached.data());
    }

    // 1) Бесплатный источник без API-ключа (приоритетный)
    if (openMeteoEnabled) {
      Optional<WeatherData> meteoByCoords = requestOpenMeteoByCoords(lat, lon, city);
      if (meteoByCoords.isPresent()) {
        return storeWeather(key, meteoByCoords.get());
      }
      Optional<WeatherData> meteoByCity = requestOpenMeteoByCityCandidates(city);
      if (meteoByCity.isPresent()) {
        return storeWeather(key, meteoByCity.get());
      }
    }

    // 2) Optional fallback на OpenWeather
    if (hasOpenWeatherKey()) {
      Optional<WeatherData> fromCoords = requestOpenWeatherByCoords(lat, lon);
      if (fromCoords.isPresent()) {
        return storeWeather(key, fromCoords.get());
      }

      Optional<WeatherData> fromCity = requestOpenWeatherByCityCandidates(city);
      if (fromCity.isPresent()) {
        return storeWeather(key, fromCity.get());
      }
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
    if (query == null || query.isBlank()) {
      return List.of();
    }
    int max = Math.max(1, Math.min(8, limit));
    Set<String> candidates = new LinkedHashSet<>(cityCandidates(query));
    List<CityOption> result = new ArrayList<>();

    if (openMeteoEnabled) {
      for (String candidate : candidates) {
        if (result.size() >= max) {
          break;
        }
        result.addAll(fetchOpenMeteoGeoCandidates(candidate, max - result.size()));
      }
    }

    if (result.size() < max && hasOpenWeatherKey()) {
      for (String candidate : candidates) {
        if (result.size() >= max) {
          break;
        }
        result.addAll(fetchOpenWeatherGeoCandidates(candidate, max - result.size()));
      }
    }

    return deduplicateCityOptions(result, max);
  }

  public Optional<CityOption> resolveCityByCoordinates(Double lat, Double lon) {
    if (lat == null || lon == null) {
      return Optional.empty();
    }

    if (openMeteoEnabled) {
      Optional<CityOption> byOpenMeteo = reverseGeocodeOpenMeteo(lat, lon);
      if (byOpenMeteo.isPresent()) {
        return byOpenMeteo;
      }
    }

    if (hasOpenWeatherKey()) {
      return reverseGeocodeOpenWeather(lat, lon);
    }

    return Optional.empty();
  }

  private Optional<WeatherData> storeWeather(String key, WeatherData data) {
    appendRainHistory(key, data.precipitationMm1h());
    long ttlSeconds = Math.max(1, cacheTtlMinutes) * 60L;
    cache.put(key, new CachedWeather(data, Instant.now().plusSeconds(ttlSeconds)));
    enforceWeatherCacheLimit();
    return Optional.of(data);
  }

  private boolean hasOpenWeatherKey() {
    return apiKey != null && !apiKey.isBlank();
  }

  private Optional<WeatherData> requestOpenMeteoByCoords(Double lat, Double lon, String debug) {
    if (lat == null || lon == null) {
      return Optional.empty();
    }
    String url = String.format(Locale.ROOT,
        "%s?latitude=%.6f&longitude=%.6f&current=temperature_2m,relative_humidity_2m,precipitation&timezone=auto",
        openMeteoBaseUrl, lat, lon);
    return executeOpenMeteoRequest(url, "open-meteo coords " + (debug == null ? "" : debug));
  }

  private Optional<WeatherData> requestOpenMeteoByCityCandidates(String city) {
    if (city == null || city.isBlank()) {
      return Optional.empty();
    }
    for (String candidate : cityCandidates(city)) {
      List<CityOption> options = fetchOpenMeteoGeoCandidates(candidate, 1);
      if (options.isEmpty()) {
        continue;
      }
      CityOption first = options.get(0);
      Optional<WeatherData> weather = requestOpenMeteoByCoords(first.lat(), first.lon(), candidate);
      if (weather.isPresent()) {
        return weather;
      }
    }
    return Optional.empty();
  }

  private Optional<WeatherData> executeOpenMeteoRequest(String url, String debugName) {
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode current = response == null ? null : response.path("current");
      if (current == null || current.isMissingNode()) {
        return Optional.empty();
      }
      double temp = current.path("temperature_2m").asDouble(Double.NaN);
      double humidity = current.path("relative_humidity_2m").asDouble(Double.NaN);
      double rain = current.path("precipitation").asDouble(0.0);
      if (Double.isNaN(temp) || Double.isNaN(humidity)) {
        return Optional.empty();
      }
      return Optional.of(new WeatherData(temp, humidity, Math.max(0.0, rain)));
    } catch (Exception ex) {
      log.debug("Open-Meteo request error for '{}': {}", debugName, ex.getMessage());
      return Optional.empty();
    }
  }

  private Optional<WeatherData> requestOpenWeatherByCoords(Double lat, Double lon) {
    if (lat == null || lon == null || !hasOpenWeatherKey()) {
      return Optional.empty();
    }
    String url = String.format(Locale.ROOT, "%s?lat=%.6f&lon=%.6f&appid=%s&units=%s", baseUrl, lat, lon, apiKey, units);
    return executeOpenWeatherRequest(url, "lat/lon");
  }

  private Optional<WeatherData> requestOpenWeatherByCityCandidates(String city) {
    if (city == null || city.isBlank() || !hasOpenWeatherKey()) {
      return Optional.empty();
    }
    for (String candidate : cityCandidates(city)) {
      String encoded = URLEncoder.encode(candidate, StandardCharsets.UTF_8);
      String url = String.format("%s?q=%s&appid=%s&units=%s", baseUrl, encoded, apiKey, units);
      Optional<WeatherData> data = executeOpenWeatherRequest(url, candidate);
      if (data.isPresent()) {
        return data;
      }
    }
    return Optional.empty();
  }

  private Optional<WeatherData> executeOpenWeatherRequest(String url, String debugName) {
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
        log.warn("OpenWeather server error for '{}': {}", debugName, ex.getStatusCode());
      }
      return Optional.empty();
    } catch (Exception ex) {
      log.debug("OpenWeather request error for '{}': {}", debugName, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<CityOption> fetchOpenMeteoGeoCandidates(String cityQuery, int limit) {
    try {
      String encoded = URLEncoder.encode(cityQuery, StandardCharsets.UTF_8);
      String url = String.format("%s?name=%s&count=%d&language=ru&format=json", openMeteoGeoBaseUrl, encoded, limit);
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode results = response == null ? null : response.path("results");
      if (results == null || !results.isArray()) {
        return List.of();
      }
      List<CityOption> list = new ArrayList<>();
      for (JsonNode node : results) {
        String name = node.path("name").asText("").trim();
        String admin1 = node.path("admin1").asText("").trim();
        String countryCode = node.path("country_code").asText("").trim();
        double lat = node.path("latitude").asDouble(Double.NaN);
        double lon = node.path("longitude").asDouble(Double.NaN);
        if (name.isEmpty() || Double.isNaN(lat) || Double.isNaN(lon)) {
          continue;
        }
        String display = name;
        if (!admin1.isEmpty()) {
          display += ", " + admin1;
        }
        if (!countryCode.isEmpty()) {
          display += ", " + countryCode;
        }
        list.add(new CityOption(display, lat, lon, countryCode));
      }
      return list;
    } catch (Exception ex) {
      log.debug("Open-Meteo geocoding failed for '{}': {}", cityQuery, ex.getMessage());
      return List.of();
    }
  }

  private List<CityOption> fetchOpenWeatherGeoCandidates(String cityQuery, int limit) {
    if (!hasOpenWeatherKey()) {
      return List.of();
    }
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
      log.debug("OpenWeather geocoding failed for '{}': {}", cityQuery, ex.getMessage());
      return List.of();
    }
  }

  private Optional<CityOption> reverseGeocodeOpenMeteo(Double lat, Double lon) {
    try {
      String url = String.format(Locale.ROOT,
          "%s?latitude=%.6f&longitude=%.6f&language=ru&format=json",
          openMeteoGeoReverseBaseUrl, lat, lon);
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode results = response == null ? null : response.path("results");
      if (results == null || !results.isArray() || results.isEmpty()) {
        return Optional.empty();
      }
      JsonNode node = results.get(0);
      String name = node.path("name").asText("").trim();
      String admin1 = node.path("admin1").asText("").trim();
      String countryCode = node.path("country_code").asText("").trim();
      if (name.isEmpty()) {
        return Optional.empty();
      }
      String display = name;
      if (!admin1.isEmpty()) {
        display += ", " + admin1;
      }
      if (!countryCode.isEmpty()) {
        display += ", " + countryCode;
      }
      return Optional.of(new CityOption(display, lat, lon, countryCode));
    } catch (Exception ex) {
      log.debug("Open-Meteo reverse geocoding failed for lat={} lon={}: {}", lat, lon, ex.getMessage());
      return Optional.empty();
    }
  }

  private Optional<CityOption> reverseGeocodeOpenWeather(Double lat, Double lon) {
    if (!hasOpenWeatherKey()) {
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
      log.debug("OpenWeather reverse geocoding failed for lat={} lon={}: {}", lat, lon, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<CityOption> deduplicateCityOptions(List<CityOption> options, int limit) {
    Set<String> seen = new LinkedHashSet<>();
    List<CityOption> unique = new ArrayList<>();
    for (CityOption option : options) {
      String id = String.format(Locale.ROOT, "%.4f:%.4f", option.lat(), option.lon());
      if (seen.add(id)) {
        unique.add(option);
      }
      if (unique.size() >= limit) {
        break;
      }
    }
    return unique;
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
    int max = Math.max(50, cacheMaxEntries);
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
    int max = Math.max(50, rainMaxKeys);
    if (rainHistory.size() <= max) {
      return;
    }
    int toRemove = rainHistory.size() - max;
    List<String> keys = new ArrayList<>(rainHistory.keySet());
    for (int i = 0; i < toRemove && i < keys.size(); i++) {
      rainHistory.remove(keys.get(i));
    }
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

  private record CachedWeather(WeatherData data, Instant expiresAt) {
  }

  private record RainSample(Instant at, double mmPerHour) {
  }
}
