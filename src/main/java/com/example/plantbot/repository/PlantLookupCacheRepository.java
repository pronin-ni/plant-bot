package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantLookupCache;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlantLookupCacheRepository extends JpaRepository<PlantLookupCache, Long> {
  Optional<PlantLookupCache> findByQueryKey(String queryKey);
}
