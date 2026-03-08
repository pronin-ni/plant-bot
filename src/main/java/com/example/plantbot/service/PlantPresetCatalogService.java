package com.example.plantbot.service;

import com.example.plantbot.domain.PlantCategory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class PlantPresetCatalogService {
  private static final Map<PlantCategory, List<String>> PRESETS_BY_CATEGORY = Map.of(
      PlantCategory.HOME, List.of(
          "Монстера", "Фикус", "Сансевиерия", "Замиокулькас", "Спатифиллум", "Хлорофитум", "Орхидея", "Алоэ", "Калатея", "Драцена"
      ),
      PlantCategory.OUTDOOR_DECORATIVE, List.of(
          "Гортензия", "Петуния", "Лаванда", "Туя", "Хоста", "Рододендрон", "Можжевельник", "Пион", "Барбарис", "Сирень"
      ),
      PlantCategory.OUTDOOR_GARDEN, List.of(
          "Томат", "Огурец", "Перец", "Баклажан", "Клубника", "Яблоня", "Груша", "Смородина", "Малина", "Кабачок"
      )
  );

  private static final Set<String> POPULAR_PRESETS = Set.of(
      "Монстера", "Сансевиерия", "Томат", "Огурец", "Клубника", "Гортензия"
  );

  private final PlantDictionaryService plantDictionaryService;

  public PlantPresetCatalogService(PlantDictionaryService plantDictionaryService) {
    this.plantDictionaryService = plantDictionaryService;
  }

  public List<String> searchByCategory(PlantCategory category, String query, int limit) {
    PlantCategory effectiveCategory = category == null ? PlantCategory.HOME : category;
    List<String> source = PRESETS_BY_CATEGORY.getOrDefault(effectiveCategory, List.of());
    String q = query == null ? "" : query.trim().toLowerCase();
    int safeLimit = Math.max(1, Math.min(limit, 20));

    List<String> staticItems = source.stream()
        .filter(name -> q.isBlank() || name.toLowerCase().contains(q))
        .sorted((a, b) -> {
          boolean aPopular = POPULAR_PRESETS.contains(a);
          boolean bPopular = POPULAR_PRESETS.contains(b);
          if (aPopular == bPopular) {
            return a.compareToIgnoreCase(b);
          }
          return aPopular ? -1 : 1;
        })
        .toList();

    List<String> dynamicItems = plantDictionaryService.searchDynamicPresets(effectiveCategory, q, safeLimit);
    LinkedHashSet<String> merged = new LinkedHashSet<>();
    merged.addAll(dynamicItems);
    merged.addAll(staticItems);
    return new ArrayList<>(merged).stream().limit(safeLimit).toList();
  }

  public boolean isPopular(String name) {
    return name != null && POPULAR_PRESETS.contains(name);
  }
}
