package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantDictionaryEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlantDictionaryEntryRepository extends JpaRepository<PlantDictionaryEntry, Long> {
  Optional<PlantDictionaryEntry> findByCategoryAndNormalizedName(PlantCategory category, String normalizedName);

  List<PlantDictionaryEntry> findByCategoryOrderByUsageCountDesc(PlantCategory category);
}

