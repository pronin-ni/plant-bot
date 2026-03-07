package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.repository.PlantRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.DependsOn;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@DependsOn("sqliteSchemaInitializer")
@RequiredArgsConstructor
@Slf4j
public class PlantCategoryMigrationService {
  private static final Set<String> GARDEN_KEYWORDS = Set.of(
      "томат", "помидор", "огур", "перец", "баклаж", "кабач", "тыкв",
      "морков", "свек", "картоф", "лук", "чеснок", "капуст", "салат",
      "яблон", "груш", "слив", "вишн", "черешн", "смородин", "крыжов",
      "малин", "клубник", "землян", "виноград"
  );

  private final PlantRepository plantRepository;

  @PostConstruct
  @Transactional
  public void migrateLegacyCategories() {
    List<Plant> plants = plantRepository.findAll();
    int changed = 0;

    for (Plant plant : plants) {
      PlantCategory current = plant.getCategory();
      PlantCategory target = inferCategory(plant);
      if (current != target) {
        plant.setCategory(target);
        changed++;
      }
    }

    if (changed > 0) {
      plantRepository.saveAll(plants);
      log.info("Plant category migration applied. updatedRows={}", changed);
    } else {
      log.info("Plant category migration skipped. no changes required");
    }
  }

  private PlantCategory inferCategory(Plant plant) {
    if (plant.getPlacement() != PlantPlacement.OUTDOOR) {
      return PlantCategory.HOME;
    }

    String name = plant.getName() == null ? "" : plant.getName().toLowerCase(Locale.ROOT);
    for (String keyword : GARDEN_KEYWORDS) {
      if (name.contains(keyword)) {
        return PlantCategory.OUTDOOR_GARDEN;
      }
    }
    return PlantCategory.OUTDOOR_DECORATIVE;
  }
}
