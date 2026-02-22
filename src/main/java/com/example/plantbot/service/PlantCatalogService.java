package com.example.plantbot.service;

import com.example.plantbot.util.PlantLookupResult;
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
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantCatalogService {
  private static final Pattern RANGE_PATTERN = Pattern.compile("(\\d+)\\s*[-–]\\s*(\\d+)");
  private static final Pattern SINGLE_PATTERN = Pattern.compile("(\\d+)");
  private static final Pattern CYRILLIC_PATTERN = Pattern.compile(".*[\\p{IsCyrillic}].*");

  private final RestTemplate restTemplate;

  @Value("${perenual.api-key:}")
  private String apiKey;

  @Value("${perenual.base-url:https://perenual.com/api}")
  private String baseUrl;

  @Value("${translate.base-url:https://api.mymemory.translated.net/get}")
  private String translateBaseUrl;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank()) {
      log.warn("Plant lookup skipped: empty query or missing PERENUAL_API_KEY");
      return Optional.empty();
    }

    List<String> queries = buildQueryCandidates(plantName.trim());
    log.info("Plant lookup started. input='{}', candidates={}", plantName, queries);

    for (String query : queries) {
      Optional<JsonNode> first = searchFirstSpecies(query);
      if (first.isEmpty()) {
        continue;
      }

      JsonNode item = first.get();
      int speciesId = item.path("id").asInt(0);
      String commonName = item.path("common_name").asText(plantName);
      String watering = item.path("watering").asText("");

      Integer benchmarkDays = fetchBenchmarkDays(speciesId);
      int days = benchmarkDays != null ? benchmarkDays : mapWateringToDays(watering);
      int clamped = clamp(days, 1, 30);

      log.info("Plant lookup success. query='{}', speciesId={}, commonName='{}', intervalDays={}",
          query, speciesId, commonName, clamped);
      return Optional.of(new PlantLookupResult(commonName, clamped, "Perenual"));
    }

    log.warn("Plant lookup failed for input='{}'", plantName);
    return Optional.empty();
  }

  private Optional<JsonNode> searchFirstSpecies(String query) {
    String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
    String url = String.format("%s/species-list?key=%s&q=%s", baseUrl, apiKey, encoded);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || !response.has("data") || !response.get("data").isArray() || response.get("data").isEmpty()) {
        log.info("Plant lookup miss for query='{}'", query);
        return Optional.empty();
      }
      return Optional.of(response.get("data").get(0));
    } catch (Exception ex) {
      log.warn("Plant lookup request failed for query='{}': {}", query, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<String> buildQueryCandidates(String original) {
    Set<String> candidates = new LinkedHashSet<>();
    candidates.add(original);
    if (CYRILLIC_PATTERN.matcher(original).matches()) {
      translateToEnglish(original).ifPresent(candidates::add);
      candidates.add(transliterateRuToEn(original));
    }
    return new ArrayList<>(candidates);
  }

  private Optional<String> translateToEnglish(String text) {
    String encoded = URLEncoder.encode(text, StandardCharsets.UTF_8);
    String url = String.format("%s?q=%s&langpair=ru|en", translateBaseUrl, encoded);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      String translated = response == null ? "" : response.path("responseData").path("translatedText").asText("").trim();
      if (translated.isEmpty()) {
        return Optional.empty();
      }
      log.info("Plant query translated ru->en: '{}' -> '{}'", text, translated);
      return Optional.of(translated);
    } catch (Exception ex) {
      log.warn("Translation failed for '{}': {}", text, ex.getMessage());
      return Optional.empty();
    }
  }

  private String transliterateRuToEn(String text) {
    StringBuilder sb = new StringBuilder();
    for (char c : text.toLowerCase().toCharArray()) {
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
    String value = sb.toString().trim();
    if (!value.isEmpty()) {
      log.info("Plant query transliterated ru->en: '{}' -> '{}'", text, value);
    }
    return value;
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
      log.warn("Failed to read Perenual details for speciesId={}: {}", speciesId, ex.getMessage());
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
