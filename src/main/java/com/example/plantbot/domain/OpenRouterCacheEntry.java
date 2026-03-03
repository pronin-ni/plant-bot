package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "openrouter_cache")
@Getter
@Setter
@NoArgsConstructor
public class OpenRouterCacheEntry {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String cacheKey;

  @Column(nullable = false, length = 32)
  private String namespace;

  @Column(nullable = false)
  private boolean hit;

  @Lob
  @Column(columnDefinition = "TEXT")
  private String payload;

  @Column(nullable = false)
  private Instant expiresAt;

  @Column(nullable = false)
  private Instant updatedAt = Instant.now();
}
