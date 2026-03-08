package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantDictionaryAlias;
import com.example.plantbot.domain.PlantDictionaryEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlantDictionaryAliasRepository extends JpaRepository<PlantDictionaryAlias, Long> {
  Optional<PlantDictionaryAlias> findByCategoryAndNormalizedAliasName(PlantCategory category, String normalizedAliasName);

  List<PlantDictionaryAlias> findByCategory(PlantCategory category);

  List<PlantDictionaryAlias> findByDictionaryEntry(PlantDictionaryEntry dictionaryEntry);
}

