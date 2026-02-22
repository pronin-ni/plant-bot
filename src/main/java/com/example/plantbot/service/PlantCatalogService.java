package com.example.plantbot.service;

import com.example.plantbot.domain.PlantLookupCache;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.repository.PlantLookupCacheRepository;
import com.example.plantbot.util.PlantLookupResult;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
  private static final Map<String, String> RU_TO_EN = Map.ofEntries(
      Map.entry("абутилон", "abutilon"),
      Map.entry("аглаонема", "aglaonema"),
      Map.entry("адениум", "adenium"),
      Map.entry("адиантум", "maidenhair fern"),
      Map.entry("азалия", "azalea"),
      Map.entry("алламанда", "allamanda"),
      Map.entry("алоэ", "aloe"),
      Map.entry("алоэ вера", "aloe vera"),
      Map.entry("альтернантера", "alternanthera"),
      Map.entry("амариллис", "amaryllis"),
      Map.entry("антуриум", "anthurium"),
      Map.entry("аспарагус", "asparagus fern"),
      Map.entry("аспидистра", "aspidistra"),
      Map.entry("аукуба", "aucuba"),
      Map.entry("ахименес", "achimenes"),
      Map.entry("бальзамин", "impatiens"),
      Map.entry("банан декоративный", "banana plant"),
      Map.entry("бегония", "begonia"),
      Map.entry("бегония рекс", "rex begonia"),
      Map.entry("бильбергия", "billbergia"),
      Map.entry("бокарнея", "ponytail palm"),
      Map.entry("бугенвиллия", "bougainvillea"),
      Map.entry("вашингтония", "washingtonia palm"),
      Map.entry("венерина мухоловка", "venus flytrap"),
      Map.entry("вриезия", "vriesea"),
      Map.entry("гардения", "gardenia"),
      Map.entry("герань", "geranium"),
      Map.entry("гибискус", "hibiscus"),
      Map.entry("гименокаллис", "hymenocallis"),
      Map.entry("гипоэстес", "hypoestes"),
      Map.entry("глоксиния", "gloxinia"),
      Map.entry("гузмания", "guzmania"),
      Map.entry("декабрист", "christmas cactus"),
      Map.entry("дендробиум", "dendrobium"),
      Map.entry("дионея", "venus flytrap"),
      Map.entry("дипладения", "mandevilla"),
      Map.entry("диффенбахия", "dieffenbachia"),
      Map.entry("долларовое дерево", "zamioculcas"),
      Map.entry("драцена", "dracaena"),
      Map.entry("драцена маргината", "dracaena marginata"),
      Map.entry("замиокулькас", "zamioculcas"),
      Map.entry("замиокулькас замиелистный", "zamioculcas zamiifolia"),
      Map.entry("зебрина", "tradescantia zebrina"),
      Map.entry("зигокактус", "christmas cactus"),
      Map.entry("ипомея батат", "ornamental sweet potato"),
      Map.entry("каладиум", "caladium"),
      Map.entry("каланхоэ", "kalanchoe"),
      Map.entry("калина комнатная", "viburnum"),
      Map.entry("каллисия", "callisia"),
      Map.entry("каллизия", "callisia"),
      Map.entry("калла", "calla lily"),
      Map.entry("камелия", "camellia"),
      Map.entry("камнеломка", "saxifraga"),
      Map.entry("кактус", "cactus"),
      Map.entry("кактус шлюмбергера", "christmas cactus"),
      Map.entry("каттлея", "cattleya"),
      Map.entry("колеус", "coleus"),
      Map.entry("колерия", "kohleria"),
      Map.entry("кордилина", "cordyline"),
      Map.entry("кофе арабика", "coffee plant"),
      Map.entry("крассула", "jade plant"),
      Map.entry("кротон", "croton"),
      Map.entry("кумкват", "kumquat"),
      Map.entry("лавр", "bay laurel"),
      Map.entry("лимон комнатный", "lemon tree"),
      Map.entry("литопс", "lithops"),
      Map.entry("мандарин комнатный", "mandarin tree"),
      Map.entry("маранта", "maranta"),
      Map.entry("мединилла", "medinilla"),
      Map.entry("мирт", "myrtle"),
      Map.entry("молочай", "euphorbia"),
      Map.entry("монстера", "monstera"),
      Map.entry("монстера делициоза", "monstera deliciosa"),
      Map.entry("нефролепис", "nephrolepis fern"),
      Map.entry("нолина", "ponytail palm"),
      Map.entry("олеандр", "oleander"),
      Map.entry("опунция", "prickly pear cactus"),
      Map.entry("орхидея", "orchid"),
      Map.entry("орхидея фаленопсис", "phalaenopsis"),
      Map.entry("орхидея дендробиум", "dendrobium"),
      Map.entry("пальма арека", "areca palm"),
      Map.entry("пальма хамедорея", "parlor palm"),
      Map.entry("папоротник", "fern"),
      Map.entry("пассифлора", "passionflower"),
      Map.entry("пахира", "money tree"),
      Map.entry("пахиподиум", "pachypodium"),
      Map.entry("пеларгония", "geranium"),
      Map.entry("пеперомия", "peperomia"),
      Map.entry("перец декоративный", "ornamental pepper"),
      Map.entry("плектрантус", "plectranthus"),
      Map.entry("плющ", "ivy"),
      Map.entry("плющ хедера", "english ivy"),
      Map.entry("подокарпус", "podocarpus"),
      Map.entry("потос", "pothos"),
      Map.entry("примула", "primrose"),
      Map.entry("пуансеттия", "poinsettia"),
      Map.entry("радермахера", "radermachera"),
      Map.entry("рео", "tradescantia spathacea"),
      Map.entry("рипсалис", "rhipsalis"),
      Map.entry("роза комнатная", "mini rose"),
      Map.entry("сансевиерия", "snake plant"),
      Map.entry("сансевьера", "snake plant"),
      Map.entry("сансевиерия трифасциата", "sansevieria trifasciata"),
      Map.entry("сенполия", "african violet"),
      Map.entry("сингониум", "syngonium"),
      Map.entry("солейролия", "soleirolia"),
      Map.entry("спатифиллум", "peace lily"),
      Map.entry("стрелиция", "bird of paradise"),
      Map.entry("стрептокарпус", "streptocarpus"),
      Map.entry("суккулент", "succulent"),
      Map.entry("тилландсия", "tillandsia"),
      Map.entry("толстянка", "jade plant"),
      Map.entry("традесканция", "tradescantia"),
      Map.entry("туя комнатная", "thuja"),
      Map.entry("узамбарская фиалка", "african violet"),
      Map.entry("фаленопсис", "phalaenopsis"),
      Map.entry("фатсия", "fatsia"),
      Map.entry("фиалка", "violet"),
      Map.entry("фикус", "ficus"),
      Map.entry("фикус бенджамина", "ficus benjamina"),
      Map.entry("фикус каучуконосный", "rubber plant"),
      Map.entry("филодендрон", "philodendron"),
      Map.entry("финиковая пальма", "date palm"),
      Map.entry("фиттония", "fittonia"),
      Map.entry("фуксия", "fuchsia"),
      Map.entry("хамедорея", "parlor palm"),
      Map.entry("хамеропс", "chamaerops"),
      Map.entry("хавортия", "haworthia"),
      Map.entry("хедера", "english ivy"),
      Map.entry("хлорофитум", "chlorophytum"),
      Map.entry("хойя", "hoya"),
      Map.entry("хризантема комнатная", "chrysanthemum"),
      Map.entry("циссус", "grape ivy"),
      Map.entry("циперус", "papyrus"),
      Map.entry("цитрус", "citrus"),
      Map.entry("шеффлера", "schefflera"),
      Map.entry("шлюмбергера", "christmas cactus"),
      Map.entry("эписция", "episcia"),
      Map.entry("эпипремнум", "pothos"),
      Map.entry("эуфорбия", "euphorbia"),
      Map.entry("юкка", "yucca")
  );

  private final RestTemplate restTemplate;
  private final PlantLookupCacheRepository plantLookupCacheRepository;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;

  @Value("${perenual.api-key:}")
  private String apiKey;

  @Value("${perenual.base-url:https://perenual.com/api}")
  private String baseUrl;

  @Value("${translate.base-url:https://api.mymemory.translated.net/get}")
  private String translateBaseUrl;

  @Value("${inaturalist.base-url:https://api.inaturalist.org/v1}")
  private String iNaturalistBaseUrl;

  @Value("${gbif.base-url:https://api.gbif.org/v1}")
  private String gbifBaseUrl;

  @Value("${perenual.cache-ttl-minutes:10080}")
  private long cacheTtlMinutes;

  private volatile long perenualBackoffUntilMillis = 0L;

  public Optional<PlantLookupResult> suggestIntervalDays(String plantName) {
    if (plantName == null || plantName.isBlank() || apiKey == null || apiKey.isBlank()) {
      log.warn("Plant lookup skipped: empty query or missing PERENUAL_API_KEY");
      return Optional.empty();
    }

    String normalizedInput = normalizeQuery(plantName.trim());
    Optional<PlantLookupResult> cached = getCached(normalizedInput);
    if (cached != null) {
      log.info("Plant lookup cache hit. input='{}', found={}", normalizedInput, cached.isPresent());
      if (cached.isPresent()) {
        PlantLookupResult r = cached.get();
        log.info("Plant lookup resolved via CACHE: query='{}', source='{}', interval={}, type={}",
            normalizedInput, r.source(), r.baseIntervalDays(), r.suggestedType());
      } else {
        log.info("Plant lookup resolved via CACHE: query='{}', source='CACHE_MISS'", normalizedInput);
      }
      return cached;
    }

    List<String> queries = buildQueryCandidates(normalizedInput);
    log.info("Plant lookup started. input='{}', candidates={}", plantName, queries);

    Optional<PlantLookupResult> aiSuggestion = openRouterPlantAdvisorService.suggestIntervalDays(plantName);
    if (aiSuggestion.isPresent()) {
      putCached(normalizedInput, aiSuggestion);
      PlantLookupResult r = aiSuggestion.get();
      log.info("Plant lookup resolved via OPENROUTER: query='{}', source='{}', interval={}, type={}",
          normalizedInput, r.source(), r.baseIntervalDays(), r.suggestedType());
      return aiSuggestion;
    }

    if (isPerenualBackoffActive()) {
      Optional<PlantLookupResult> fallback = fallbackLookup(queries, plantName);
      putCached(normalizedInput, fallback);
      fallback.ifPresent(r -> log.info(
          "Plant lookup resolved via FALLBACK_BACKOFF: query='{}', source='{}', interval={}, type={}",
          normalizedInput, r.source(), r.baseIntervalDays(), r.suggestedType()));
      return fallback;
    }

    for (String query : queries) {
      Optional<JsonNode> first = searchFirstSpecies(query);
      if (first.isEmpty()) {
        continue;
      }

      JsonNode item = first.get();
      int speciesId = item.path("id").asInt(0);
      String commonName = item.path("common_name").asText(plantName);
      String watering = item.path("watering").asText("");
      PlantType suggestedType = inferPlantType(commonName, watering, query);

      Integer benchmarkDays = fetchBenchmarkDays(speciesId);
      int days = benchmarkDays != null ? benchmarkDays : mapWateringToDays(watering);
      int clamped = clamp(days, 1, 30);

      log.info("Plant lookup success. query='{}', speciesId={}, commonName='{}', intervalDays={}, suggestedType={}",
          query, speciesId, commonName, clamped, suggestedType);
      Optional<PlantLookupResult> value = Optional.of(new PlantLookupResult(commonName, clamped, "Perenual", suggestedType));
      putCached(normalizedInput, value);
      log.info("Plant lookup resolved via PERENUAL: query='{}', source='{}', interval={}, type={}",
          normalizedInput, "Perenual", clamped, suggestedType);
      return value;
    }

    Optional<PlantLookupResult> fallback = fallbackLookup(queries, plantName);
    if (fallback.isPresent()) {
      putCached(normalizedInput, fallback);
      PlantLookupResult r = fallback.get();
      log.info("Plant lookup resolved via FALLBACK: query='{}', source='{}', interval={}, type={}",
          normalizedInput, r.source(), r.baseIntervalDays(), r.suggestedType());
      return fallback;
    }

    log.warn("Plant lookup failed for input='{}'", plantName);
    Optional<PlantLookupResult> empty = Optional.empty();
    putCached(normalizedInput, empty);
    return empty;
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
    } catch (HttpStatusCodeException ex) {
      if (ex.getStatusCode().value() == 429 || ex.getStatusCode().is5xxServerError()) {
        activatePerenualBackoff();
      }
      log.warn("Plant lookup request failed for query='{}': {} {}", query, ex.getStatusCode(), ex.getMessage());
      return Optional.empty();
    } catch (Exception ex) {
      log.warn("Plant lookup request failed for query='{}': {}", query, ex.getMessage());
      return Optional.empty();
    }
  }

  private Optional<PlantLookupResult> fallbackLookup(List<String> queries, String originalInput) {
    for (String query : queries) {
      Optional<PlantLookupResult> gbif = gbifLookup(query, originalInput);
      if (gbif.isPresent()) {
        return gbif;
      }
    }
    PlantType type = inferPlantType(originalInput, "", originalInput);
    int interval = intervalFromType(type);
    log.info("Fallback heuristic used for '{}': type={}, interval={}", originalInput, type, interval);
    return Optional.of(new PlantLookupResult(originalInput, interval, "Heuristic", type));
  }

  private Optional<PlantLookupResult> gbifLookup(String query, String originalInput) {
    String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
    String url = String.format("%s/species/suggest?q=%s&limit=3", gbifBaseUrl, encoded);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || !response.isArray() || response.isEmpty()) {
        return Optional.empty();
      }
      JsonNode first = response.get(0);
      String canonical = first.path("canonicalName").asText("").trim();
      String scientific = first.path("scientificName").asText("").trim();
      String display = !canonical.isEmpty() ? canonical : (!scientific.isEmpty() ? scientific : originalInput);
      String signal = (canonical + " " + scientific + " " + query).trim();
      PlantType type = inferPlantType(signal, "", signal);
      int interval = intervalFromType(type);
      log.info("GBIF fallback success. query='{}', display='{}', type={}, interval={}",
          query, display, type, interval);
      return Optional.of(new PlantLookupResult(display, interval, "GBIF", type));
    } catch (Exception ex) {
      log.warn("GBIF fallback failed for query='{}': {}", query, ex.getMessage());
      return Optional.empty();
    }
  }

  private List<String> buildQueryCandidates(String original) {
    Set<String> candidates = new LinkedHashSet<>();
    String normalized = normalizeQuery(original);
    addCandidate(candidates, normalized);
    if (CYRILLIC_PATTERN.matcher(normalized).matches()) {
      dictionaryTranslate(normalized).ifPresent(value -> addCandidate(candidates, value));
      translateToEnglish(normalized).ifPresent(value -> addCandidate(candidates, value));
      addCandidate(candidates, transliterateRuToEn(normalized));
      iNaturalistToQueries(normalized).forEach(value -> addCandidate(candidates, value));
    }
    return new ArrayList<>(candidates);
  }

  private void addCandidate(Set<String> candidates, String raw) {
    if (raw == null || raw.isBlank()) {
      return;
    }
    String value = normalizeQuery(raw.replace('+', ' '));
    if (value.contains("%")) {
      try {
        value = normalizeQuery(URLDecoder.decode(value, StandardCharsets.UTF_8));
      } catch (Exception ignored) {
      }
    }
    if (value.isBlank()) {
      return;
    }
    if (value.contains("%d0") || value.contains("%d1")) {
      return;
    }
    candidates.add(value);
  }

  private String normalizeQuery(String value) {
    return value == null ? "" : value.trim().toLowerCase().replace('ё', 'е');
  }

  private Optional<String> dictionaryTranslate(String text) {
    String direct = RU_TO_EN.get(text);
    if (direct != null && !direct.isBlank()) {
      log.info("Plant query dictionary ru->en: '{}' -> '{}'", text, direct);
      return Optional.of(direct);
    }
    for (Map.Entry<String, String> item : RU_TO_EN.entrySet()) {
      if (text.contains(item.getKey())) {
        log.info("Plant query dictionary contains ru->en: '{}' -> '{}'", text, item.getValue());
        return Optional.of(item.getValue());
      }
    }
    return Optional.empty();
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
      String normalized = maybeDecodePercentEncoding(translated);
      log.info("Plant query translated ru->en: '{}' -> '{}'", text, normalized);
      return Optional.of(normalized);
    } catch (Exception ex) {
      log.warn("Translation failed for '{}': {}", text, ex.getMessage());
      return Optional.empty();
    }
  }

  private String maybeDecodePercentEncoding(String value) {
    if (value == null || value.isBlank() || !value.contains("%")) {
      return value;
    }
    try {
      return URLDecoder.decode(value, StandardCharsets.UTF_8);
    } catch (Exception ex) {
      log.warn("Failed to decode translated value '{}': {}", value, ex.getMessage());
      return value;
    }
  }

  private List<String> iNaturalistToQueries(String text) {
    List<String> result = new ArrayList<>();
    String encoded = URLEncoder.encode(text, StandardCharsets.UTF_8);
    String url = String.format("%s/taxa/autocomplete?q=%s&locale=ru&all_names=true&per_page=3",
        iNaturalistBaseUrl, encoded);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      JsonNode items = response == null ? null : response.path("results");
      if (items == null || !items.isArray() || items.isEmpty()) {
        log.info("iNaturalist miss for query='{}'", text);
        return result;
      }
      for (JsonNode item : items) {
        String scientific = item.path("name").asText("").trim();
        String common = item.path("preferred_common_name").asText("").trim();
        if (!common.isEmpty()) {
          result.add(common);
        }
        if (!scientific.isEmpty()) {
          result.add(scientific);
        }
      }
      if (!result.isEmpty()) {
        log.info("iNaturalist aliases for '{}': {}", text, result);
      }
      return result;
    } catch (Exception ex) {
      log.warn("iNaturalist request failed for '{}': {}", text, ex.getMessage());
      return result;
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

  private Optional<PlantLookupResult> getCached(String key) {
    Optional<PlantLookupCache> cached = plantLookupCacheRepository.findByQueryKey(key);
    if (cached.isEmpty()) {
      return null;
    }
    PlantLookupCache entry = cached.get();
    if (entry.getExpiresAt() == null || entry.getExpiresAt().isBefore(Instant.now())) {
      plantLookupCacheRepository.delete(entry);
      return null;
    }
    if (!entry.isHit()) {
      return Optional.empty();
    }
    if (entry.getDisplayName() == null || entry.getBaseIntervalDays() == null) {
      return Optional.empty();
    }
    return Optional.of(new PlantLookupResult(
        entry.getDisplayName(),
        entry.getBaseIntervalDays(),
        entry.getSource() == null ? "Perenual" : entry.getSource(),
        entry.getSuggestedType() == null ? PlantType.DEFAULT : entry.getSuggestedType()
    ));
  }

  private void putCached(String key, Optional<PlantLookupResult> value) {
    long ttlSeconds = Math.max(1, cacheTtlMinutes) * 60L;
    PlantLookupCache row = plantLookupCacheRepository.findByQueryKey(key).orElseGet(PlantLookupCache::new);
    row.setQueryKey(key);
    row.setHit(value.isPresent());
    row.setExpiresAt(Instant.now().plusSeconds(ttlSeconds));
    row.setUpdatedAt(Instant.now());
    if (value.isPresent()) {
      PlantLookupResult payload = value.get();
      row.setDisplayName(payload.displayName());
      row.setBaseIntervalDays(payload.baseIntervalDays());
      row.setSource(payload.source());
      row.setSuggestedType(payload.suggestedType());
    } else {
      row.setDisplayName(null);
      row.setBaseIntervalDays(null);
      row.setSource(null);
      row.setSuggestedType(null);
    }
    plantLookupCacheRepository.save(row);
  }

  private PlantType inferPlantType(String commonName, String watering, String query) {
    String joined = (commonName + " " + watering + " " + query).toLowerCase();
    if (joined.contains("fern")) {
      return PlantType.FERN;
    }
    if (joined.contains("cactus")
        || joined.contains("succulent")
        || joined.contains("haworthia")
        || joined.contains("aloe")
        || joined.contains("jade")
        || joined.contains("lithops")) {
      return PlantType.SUCCULENT;
    }
    if (joined.contains("minimum")) {
      return PlantType.SUCCULENT;
    }
    if (joined.contains("orchid")
        || joined.contains("monstera")
        || joined.contains("philodendron")
        || joined.contains("anthurium")
        || joined.contains("dracaena")
        || joined.contains("ficus")
        || joined.contains("pothos")
        || joined.contains("calathea")
        || joined.contains("alocasia")
        || joined.contains("zamioculcas")) {
      return PlantType.TROPICAL;
    }
    return PlantType.DEFAULT;
  }

  private int intervalFromType(PlantType type) {
    return switch (type) {
      case SUCCULENT -> 14;
      case FERN -> 4;
      case TROPICAL -> 7;
      default -> 7;
    };
  }

  private boolean isPerenualBackoffActive() {
    return perenualBackoffUntilMillis > System.currentTimeMillis();
  }

  private void activatePerenualBackoff() {
    long backoffMillis = 60L * 60L * 1000L;
    perenualBackoffUntilMillis = System.currentTimeMillis() + backoffMillis;
    log.warn("Perenual backoff enabled for {} minutes", backoffMillis / 60000L);
  }
}
