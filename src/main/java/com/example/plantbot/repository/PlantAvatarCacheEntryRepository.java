package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantAvatarCacheEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlantAvatarCacheEntryRepository extends JpaRepository<PlantAvatarCacheEntry, Long> {
  Optional<PlantAvatarCacheEntry> findByCacheKey(String cacheKey);
}
