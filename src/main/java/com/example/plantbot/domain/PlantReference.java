package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "plant_reference")
@Getter
@Setter
@NoArgsConstructor
public class PlantReference {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, unique = true)
  private PlantType type;

  private double minWaterPercent;
  private double maxWaterPercent;

  private Integer defaultBaseIntervalDays;
}
