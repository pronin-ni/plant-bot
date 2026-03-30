package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_growth_entries",
    indexes = {
        @Index(name = "idx_growth_plant_id", columnList = "plant_id"),
        @Index(name = "idx_growth_created_at", columnList = "created_at"),
        @Index(name = "idx_growth_plant_created", columnList = "plant_id, created_at")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantGrowthEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "plant_id", nullable = false)
    private Plant plant;

    @Column(nullable = false)
    private String imageUrl;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private GrowthEntrySource source = GrowthEntrySource.MANUAL;

    @Column(length = 500)
    private String aiSummary;

    @Column(length = 2000)
    private String metadataJson;

    public enum GrowthEntrySource {
        MANUAL,
        CAMERA,
        AUTO
    }
}
