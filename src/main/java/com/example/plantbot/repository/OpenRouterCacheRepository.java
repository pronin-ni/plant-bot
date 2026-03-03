package com.example.plantbot.repository;

import com.example.plantbot.domain.OpenRouterCacheEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OpenRouterCacheRepository extends JpaRepository<OpenRouterCacheEntry, Long> {
  Optional<OpenRouterCacheEntry> findByCacheKey(String cacheKey);

  long countByNamespace(String namespace);

  List<OpenRouterCacheEntry> findTop200ByOrderByUpdatedAtAsc();

  void deleteByExpiresAtBefore(Instant cutoff);
}
