package com.example.plantbot.domain.ha;

import com.example.plantbot.domain.Plant;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "plant_home_assistant_bindings")
@Getter
@Setter
@NoArgsConstructor
public class PlantHomeAssistantBinding {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "plant_id", nullable = false, unique = true)
  private Plant plant;

  private String areaId;
  private String areaName;

  @Column(length = 255)
  private String temperatureEntityId;

  @Column(length = 255)
  private String humidityEntityId;

  @Column(length = 255)
  private String soilMoistureEntityId;

  @Column(length = 255)
  private String illuminanceEntityId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private HaSensorSelectionMode selectionMode = HaSensorSelectionMode.AUTO_DISCOVERY;

  @Column(nullable = false)
  private Boolean autoAdjustmentEnabled = true;

  @Column(nullable = false)
  private Double maxAdjustmentFraction = 0.35;

  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();
}
