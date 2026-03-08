package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_dictionary_aliases",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_alias_category_normalized", columnNames = {"category", "normalized_alias_name"})
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantDictionaryAlias {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "dictionary_entry_id", nullable = false)
  private PlantDictionaryEntry dictionaryEntry;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantCategory category;

  @Column(nullable = false)
  private String aliasName;

  @Column(name = "normalized_alias_name", nullable = false)
  private String normalizedAliasName;

  private Integer confidence;
  private String resolvedBy;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();
}

