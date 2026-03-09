package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "recommendation_snapshots")
@Getter
@Setter
@NoArgsConstructor
public class RecommendationSnapshot {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "plant_id", nullable = false)
  private Plant plant;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private RecommendationSource source;

  @Column(nullable = false)
  private Integer recommendedIntervalDays;

  @Column(nullable = false)
  private Integer recommendedWaterVolumeMl;

  @Column(length = 1024)
  private String summary;

  @Column(length = 4000)
  private String reasoningJson;

  @Column(length = 4000)
  private String warningsJson;

  @Column(length = 4000)
  private String weatherContextSnapshotJson;

  private Double confidenceScore;

  private Instant generatedAt;

  @Column(nullable = false)
  private Instant createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }
}
