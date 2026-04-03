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
    name = "plant_avatar_cache_entries",
    indexes = {
        @Index(name = "idx_plant_avatar_cache_key", columnList = "cacheKey", unique = true),
        @Index(name = "idx_plant_avatar_normalized_name", columnList = "normalizedName"),
        @Index(name = "idx_plant_avatar_last_accessed", columnList = "lastAccessedAt")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantAvatarCacheEntry {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 255, unique = true)
  private String cacheKey;

  @Column(nullable = false, length = 255)
  private String exactName;

  @Column(nullable = false, length = 255)
  private String normalizedName;

  @Lob
  @Column(nullable = false, columnDefinition = "TEXT")
  private String specJson;

  @Lob
  @Column(nullable = false, columnDefinition = "TEXT")
  private String svg;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 32)
  private PlantAvatarSource source;

  @Column(length = 160)
  private String modelName;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  @Column(nullable = false)
  private Instant updatedAt = Instant.now();

  @Column(nullable = false)
  private Instant lastAccessedAt = Instant.now();

  @Column(nullable = false)
  private long hitCount = 0L;
}
