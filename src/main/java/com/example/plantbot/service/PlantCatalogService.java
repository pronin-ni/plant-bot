package com.example.plantbot.service;

import com.example.plantbot.util.PlantLookupResult;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class PlantCatalogService {
  private static final Pattern RANGE_PATTERN = Pattern.compile("(\\d+)\\s*[-–]\\s*(\\d+)");
  private static final Pattern SINGLE_PATTERN = Pattern.compile("(\\d+)");

  private final RestTemplate restTemplate;

  @Value("${perenual.api-key:}")
  private String apiKey;

  @Value("${perenual.base-url:https://perenual.com/api}")
  private String baseUrl;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }

    String encoded = URLEncoder.encode(plantName, StandardCharsets.UTF_8);
    String searchUrl = String.format("%s/species-list?key=%s&q=%s", baseUrl, apiKey, encoded);
    try {
      JsonNode searchResponse = restTemplate.getForObject(searchUrl, JsonNode.class);
      if (searchResponse == null || !searchResponse.has("data") || !searchResponse.get("data").isArray()
          || searchResponse.get("data").isEmpty()) {
        return Optional.empty();
      }

      JsonNode first = searchResponse.get("data").get(0);
      int speciesId = first.path("id").asInt(0);
      String commonName = first.path("common_name").asText(plantName);
      String watering = first.path("watering").asText("");

      Integer benchmarkDays = fetchBenchmarkDays(speciesId);
      int days = benchmarkDays != null ? benchmarkDays : mapWateringToDays(watering);
      return Optional.of(new PlantLookupResult(commonName, clamp(days, 1, 30), "Perenual"));
    } catch (Exception ex) {
      return Optional.empty();
    }
  }

  private Integer fetchBenchmarkDays(int speciesId) {
    if (speciesId <= 0) {
      return null;
    }
    String detailsUrl = String.format("%s/species/details/%d?key=%s", baseUrl, speciesId, apiKey);
    try {
      JsonNode details = restTemplate.getForObject(detailsUrl, JsonNode.class);
      if (details == null) {
        return null;
      }

      String benchmark = details.path("watering_general_benchmark").path("value").asText("");
      Integer parsed = parseDaysFromText(benchmark);
      if (parsed != null) {
        return parsed;
      }

      String care = details.path("care-guides").path("watering").asText("");
      return parseDaysFromText(care);
    } catch (Exception ex) {
      return null;
    }
  }

  private Integer parseDaysFromText(String text) {
    if (text == null || text.isBlank()) {
      return null;
    }

    Matcher range = RANGE_PATTERN.matcher(text);
    if (range.find()) {
      int left = Integer.parseInt(range.group(1));
      int right = Integer.parseInt(range.group(2));
      return (left + right) / 2;
    }

    Matcher single = SINGLE_PATTERN.matcher(text);
    if (single.find()) {
      return Integer.parseInt(single.group(1));
    }
    return null;
  }

  private int mapWateringToDays(String watering) {
    String value = watering == null ? "" : watering.trim().toLowerCase();
    return switch (value) {
      case "frequent" -> 3;
      case "average" -> 7;
      case "minimum" -> 14;
      case "none" -> 21;
      default -> 7;
    };
  }

  private int clamp(int value, int min, int max) {
    return Math.max(min, Math.min(max, value));
  }
}
