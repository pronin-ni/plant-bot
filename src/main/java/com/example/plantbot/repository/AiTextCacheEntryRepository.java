package com.example.plantbot.repository;

import com.example.plantbot.domain.AiTextCacheEntry;
import com.example.plantbot.domain.AiTextFeatureType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AiTextCacheEntryRepository extends JpaRepository<AiTextCacheEntry, Long> {
  Optional<AiTextCacheEntry> findByCacheKeyAndInvalidatedAtIsNull(String cacheKey);

  long countByInvalidatedAtIsNull();

  long countByFeatureTypeAndInvalidatedAtIsNull(AiTextFeatureType featureType);

  long countByUserIdAndInvalidatedAtIsNull(Long userId);

  long countByUserIdAndPlantIdAndInvalidatedAtIsNull(Long userId, Long plantId);

  List<AiTextCacheEntry> findTop200ByInvalidatedAtIsNullOrderByLastAccessedAtAsc();

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @Query("delete from AiTextCacheEntry e where e.expiresAt < :cutoff or e.invalidatedAt is not null")
  int deleteExpiredOrInvalidated(@Param("cutoff") Instant cutoff);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @Query("""
      update AiTextCacheEntry e
         set e.invalidatedAt = :invalidatedAt
       where e.userId = :userId
         and e.plantId = :plantId
         and e.invalidatedAt is null
      """)
  int invalidatePlantScoped(
      @Param("userId") Long userId,
      @Param("plantId") Long plantId,
      @Param("invalidatedAt") Instant invalidatedAt
  );

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @Query("""
      update AiTextCacheEntry e
         set e.invalidatedAt = :invalidatedAt
       where e.userId = :userId
         and e.plantId = :plantId
         and e.featureType in :featureTypes
         and e.invalidatedAt is null
      """)
  int invalidatePlantFeatures(
      @Param("userId") Long userId,
      @Param("plantId") Long plantId,
      @Param("featureTypes") Collection<AiTextFeatureType> featureTypes,
      @Param("invalidatedAt") Instant invalidatedAt
  );

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @Query("""
      update AiTextCacheEntry e
         set e.invalidatedAt = :invalidatedAt
       where e.userId = :userId
         and e.plantId is null
         and e.featureType in :featureTypes
         and e.invalidatedAt is null
      """)
  int invalidateUserDraftFeatures(
      @Param("userId") Long userId,
      @Param("featureTypes") Collection<AiTextFeatureType> featureTypes,
      @Param("invalidatedAt") Instant invalidatedAt
  );
}
