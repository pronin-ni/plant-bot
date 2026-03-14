package com.example.plantbot.service.weather;

import com.example.plantbot.util.CityOption;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class WeatherLocationService {
  private static final Map<String, String> CITY_ALIASES = Map.ofEntries(
      Map.entry("санкт-петербург", "Saint Petersburg"),
      Map.entry("санкт петербург", "Saint Petersburg"),
      Map.entry("питер", "Saint Petersburg"),
      Map.entry("москва", "Moscow"),
      Map.entry("екатеринбург", "Yekaterinburg"),
      Map.entry("нижний новгород", "Nizhny Novgorod")
  );

  private final RestTemplate restTemplate;

  @Value("${openmeteo.enabled:true}")
  private boolean openMeteoEnabled;

  @Value("${openmeteo.geocode-base-url:https://geocoding-api.open-meteo.com/v1/search}")
  private String openMeteoGeoBaseUrl;

  @Value("${openmeteo.geocode-reverse-base-url:https://geocoding-api.open-meteo.com/v1/reverse}")
  private String openMeteoGeoReverseBaseUrl;

  @Value("${openweather.api-key:}")
  private String openWeatherApiKey;

  @Value("${openweather.geo-base-url:https://api.openweathermap.org/geo/1.0/direct}")
  private String openWeatherGeoBaseUrl;

  @Value("${openweather.geo-reverse-base-url:https://api.openweathermap.org/geo/1.0/reverse}")
  private String openWeatherGeoReverseBaseUrl;

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

  public CityOption resolveForecastLocation(Double lat, Double lon, String city) {
    if (lat != null && lon != null) {
      return new CityOption(city == null ? "" : city, lat, lon, null);
    }
    List<CityOption> options = resolveCityOptions(city, 1);
    return options.isEmpty() ? null : options.get(0);
  }

  private boolean hasOpenWeatherKey() {
    return openWeatherApiKey != null && !openWeatherApiKey.isBlank();
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
      String url = String.format("%s?q=%s&limit=%d&appid=%s", openWeatherGeoBaseUrl, encoded, limit, openWeatherApiKey);
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
          openWeatherGeoReverseBaseUrl, lat, lon, openWeatherApiKey);
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
    if (city == null || city.isBlank()) {
      return List.of();
    }
    String original = city.trim();
    String primary = extractPrimaryCityName(original);
    String normalized = normalize(primary);
    Set<String> values = new LinkedHashSet<>();

    addCityCandidate(values, primary);
    addCityCandidate(values, primary + ",RU");
    if (!primary.equalsIgnoreCase(original)) {
      addCityCandidate(values, original);
    }

    String alias = CITY_ALIASES.get(normalized);
    if (alias != null) {
      addCityCandidate(values, alias);
      addCityCandidate(values, alias + ",RU");
    }

    String translit = transliterateRuToEn(normalized);
    if (!translit.isBlank()) {
      String translitCity = capitalizeWords(translit);
      addCityCandidate(values, translitCity);
      addCityCandidate(values, translitCity + ",RU");
    }

    return new ArrayList<>(values);
  }

  private void addCityCandidate(Set<String> values, String candidate) {
    if (candidate == null) {
      return;
    }
    String normalized = candidate.trim().replaceAll("\\s+", " ");
    if (normalized.isBlank()) {
      return;
    }
    values.add(normalized);
  }

  private String extractPrimaryCityName(String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isEmpty()) {
      return "";
    }
    int comma = normalized.indexOf(',');
    if (comma > 0) {
      normalized = normalized.substring(0, comma).trim();
    }
    normalized = normalized.replaceAll("(?iu)^(г\\.?|город)\\s+", "");
    return normalized.trim();
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
}
