package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "plant_lookup_cache")
@Getter
@Setter
@NoArgsConstructor
public class PlantLookupCache {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String queryKey;

  @Column(nullable = false)
  private boolean hit;

  private String displayName;
  private Integer baseIntervalDays;
  private String source;

  @Enumerated(EnumType.STRING)
  private PlantType suggestedType;

  @Column(nullable = false)
  private Instant expiresAt;

  @Column(nullable = false)
  private Instant updatedAt = Instant.now();
}
