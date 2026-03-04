package com.example.plantbot.domain.ha;

import com.example.plantbot.domain.Plant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "plant_adjustment_logs")
@Getter
@Setter
@NoArgsConstructor
public class PlantAdjustmentLog {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "plant_id", nullable = false)
  private Plant plant;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  private Double baseIntervalDays;
  private Double adjustedIntervalDays;
  private Double deltaPercent;
  private String source;
  private String reason;
  private Boolean adjustmentApplied;
}
