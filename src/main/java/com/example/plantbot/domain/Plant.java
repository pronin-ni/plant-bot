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

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantCategory category = PlantCategory.HOME;

  @Enumerated(EnumType.STRING)
  @Column
  private PlantEnvironmentType wateringProfile = PlantEnvironmentType.INDOOR;

  @Enumerated(EnumType.STRING)
  @Column
  private WateringProfileType wateringProfileType;

  @Enumerated(EnumType.STRING)
  @Column
  private PlantPlacementType plantPlacementType;

  private String region;
  private String city;

  @Enumerated(EnumType.STRING)
  private PlantContainerType containerType;

  // Для outdoor ornamental может отличаться от potVolumeLiters.
  private Double containerVolumeLiters;

  // Для outdoor garden: тип культуры (например, tomato, cucumber).
  private String cropType;

  @Enumerated(EnumType.STRING)
  private PlantGrowthStage growthStage;

  @Enumerated(EnumType.STRING)
  private GrowthStage growthStageV2;

  private Boolean greenhouse;

  private Boolean dripIrrigation;

  private Double outdoorAreaM2;

  @Enumerated(EnumType.STRING)
  private OutdoorSoilType outdoorSoilType;

  @Enumerated(EnumType.STRING)
  private SoilType soilType;

  @Enumerated(EnumType.STRING)
  private SunExposure sunExposure;

  @Enumerated(EnumType.STRING)
  private SunlightExposure sunlightExposure;

  private Boolean mulched;

  private Boolean perennial;

  private Boolean winterDormancyEnabled;

  @Column(nullable = false)
  private LocalDate lastWateredDate;

  @Column(nullable = false)
  private int baseIntervalDays;

  private Integer manualWaterVolumeMl;

  private Boolean weatherAdjustmentEnabled;

  private Boolean aiWateringEnabled;

  // Пользовательский объём полива в мл (если задан в wizard).
  private Integer preferredWaterMl;

  @Enumerated(EnumType.STRING)
  private RecommendationSource lastRecommendationSource;

  private Integer lastRecommendedIntervalDays;

  private Integer lastRecommendedWaterMl;

  @Column(length = 1024)
  private String lastRecommendationSummary;

  private Instant lastRecommendationUpdatedAt;

  private Integer recommendedIntervalDays;

  private Integer recommendedWaterVolumeMl;

  @Enumerated(EnumType.STRING)
  private RecommendationSource recommendationSource;

  @Column(length = 1024)
  private String recommendationSummary;

  @Column(length = 4000)
  private String recommendationReasoningJson;

  @Column(length = 4000)
  private String recommendationWarningsJson;

  private Double confidenceScore;

  private Instant generatedAt;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantType type = PlantType.DEFAULT;

  private String photoUrl;

  private String lookupSource;

  private Instant lookupAt;

  private LocalDate lastReminderDate;

  private Instant createdAt = Instant.now();
}
