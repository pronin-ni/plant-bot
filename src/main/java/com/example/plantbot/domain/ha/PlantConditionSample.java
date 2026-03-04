package com.example.plantbot.domain.ha;

import com.example.plantbot.domain.Plant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_condition_samples",
    indexes = {
        @Index(name = "idx_plant_condition_samples_plant_sampled", columnList = "plant_id,sampledAt")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantConditionSample {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "plant_id", nullable = false)
  private Plant plant;

  @Column(nullable = false)
  private Instant sampledAt = Instant.now();

  private Double temperatureC;
  private Double humidityPercent;
  private Double soilMoisturePercent;
  private Double illuminanceLux;

  private String source;
}
