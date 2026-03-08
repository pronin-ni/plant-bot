package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "plant_duplicate_merge_tasks",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_merge_task_pair",
            columnNames = {"category", "left_normalized_name", "right_normalized_name"}
        )
    }
)
@Getter
@Setter
@NoArgsConstructor
public class PlantDuplicateMergeTask {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PlantCategory category;

  @Column(nullable = false)
  private String leftName;

  @Column(nullable = false)
  private String rightName;

  @Column(name = "left_normalized_name", nullable = false)
  private String leftNormalizedName;

  @Column(name = "right_normalized_name", nullable = false)
  private String rightNormalizedName;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private DictionaryMergeStatus status = DictionaryMergeStatus.PENDING;

  @Column(nullable = false)
  private Integer attemptCount = 0;

  @Column(nullable = false)
  private Instant nextAttemptAt = Instant.now();

  private String lastError;
  private Instant lastNotificationAt;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  @Column(nullable = false)
  private Instant updatedAt = Instant.now();
}

