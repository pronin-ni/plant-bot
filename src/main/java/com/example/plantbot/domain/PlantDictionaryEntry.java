package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_dictionary_entries",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_dictionary_category_normalized", columnNames = {"category", "normalized_name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantDictionaryEntry {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantCategory category;

  @Column(nullable = false)
  private String canonicalName;

  @Column(name = "normalized_name", nullable = false)
  private String normalizedName;

  @Column(nullable = false)
  private Long usageCount = 0L;

  private Instant firstSeenAt;
  private Instant lastSeenAt;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  @Column(nullable = false)
  private Instant updatedAt = Instant.now();
}

