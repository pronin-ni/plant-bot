package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "plants")
@Getter
@Setter
@NoArgsConstructor
public class Plant {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.EAGER)
  @JoinColumn(name = "user_id")
  private User user;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private double potVolumeLiters;

  @Enumerated(EnumType.STRING)
  @Column
  private PlantPlacement placement = PlantPlacement.INDOOR;

  private Double outdoorAreaM2;

  @Enumerated(EnumType.STRING)
  private OutdoorSoilType outdoorSoilType;

  @Enumerated(EnumType.STRING)
  private SunExposure sunExposure;

  private Boolean mulched;

  private Boolean perennial;

  private Boolean winterDormancyEnabled;

  @Column(nullable = false)
  private LocalDate lastWateredDate;

  @Column(nullable = false)
  private int baseIntervalDays;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantType type = PlantType.DEFAULT;

  private String lookupSource;

  private Instant lookupAt;

  private LocalDate lastReminderDate;

  private Instant createdAt = Instant.now();
}
