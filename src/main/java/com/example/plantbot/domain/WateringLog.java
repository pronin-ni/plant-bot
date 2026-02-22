package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "watering_log")
@Getter
@Setter
@NoArgsConstructor
public class WateringLog {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "plant_id")
  private Plant plant;

  @Column(nullable = false)
  private LocalDate wateredAt;

  private Double recommendedIntervalDays;
  private Double recommendedWaterLiters;

  private Double temperatureC;
  private Double humidityPercent;

  private Instant createdAt = Instant.now();
}
