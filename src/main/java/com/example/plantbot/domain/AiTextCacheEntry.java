package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "ai_text_cache_entries",
    indexes = {
        @Index(name = "idx_ai_text_cache_key", columnList = "cacheKey", unique = true),
        @Index(name = "idx_ai_text_cache_user_plant_feature", columnList = "userId, plantId, featureType"),
        @Index(name = "idx_ai_text_cache_feature_expires", columnList = "featureType, expiresAt"),
        @Index(name = "idx_ai_text_cache_invalidated", columnList = "invalidatedAt"),
        @Index(name = "idx_ai_text_cache_last_accessed", columnList = "lastAccessedAt")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class AiTextCacheEntry {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 255, unique = true)
  private String cacheKey;

  @Column(nullable = false)
  private Long userId;

  /**
   * Может быть null для pre-create / draft AI flows, где растение ещё не создано.
   */
  @Column
  private Long plantId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 64)
  private AiTextFeatureType featureType;

  @Column(nullable = false, length = 128)
  private String inputHash;

  @Column(nullable = false, length = 160)
  private String modelName;

  @Lob
  @Column(nullable = false, columnDefinition = "TEXT")
  private String responsePayload;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  @Column(nullable = false)
  private Instant expiresAt;

  @Column(nullable = false)
  private Instant lastAccessedAt = Instant.now();

  @Column(nullable = false)
  private long hitCount = 0L;

  @Column
  private Instant invalidatedAt;

  @Column(nullable = false)
  private int schemaVersion = 1;
}
