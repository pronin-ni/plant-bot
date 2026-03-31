package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_notes",
    indexes = {
        @Index(name = "idx_plant_notes_plant_id", columnList = "plant_id"),
        @Index(name = "idx_plant_notes_created_at", columnList = "created_at")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantNote {

    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "plant_id")
    private Plant plant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NoteType type;

    @Column(length = 256)
    private String title;

    @Column(length = 256)
    private String amount;

    @Column(nullable = false, length = 2000)
    private String text;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public enum NoteType {
        GENERAL,
        FEEDING,
        ISSUE
    }
}
