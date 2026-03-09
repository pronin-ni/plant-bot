package com.example.plantbot.repository;

import com.example.plantbot.domain.OpenRouterCacheEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OpenRouterCacheRepository extends JpaRepository<OpenRouterCacheEntry, Long> {
  Optional<OpenRouterCacheEntry> findByCacheKey(String cacheKey);

  long countByNamespace(String namespace);

  List<OpenRouterCacheEntry> findTop200ByOrderByUpdatedAtAsc();

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @Query("delete from OpenRouterCacheEntry e where e.expiresAt < :cutoff")
  int deleteExpired(@Param("cutoff") Instant cutoff);
}
