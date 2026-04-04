package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "ai_request_event",
    indexes = {
        @Index(name = "idx_ai_request_event_created_at", columnList = "created_at"),
        @Index(name = "idx_ai_request_event_provider", columnList = "provider"),
        @Index(name = "idx_ai_request_event_kind", columnList = "request_kind"),
        @Index(name = "idx_ai_request_event_success", columnList = "success")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class AiRequestEvent {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Enumerated(EnumType.STRING)
  @Column(name = "provider", nullable = false, length = 32)
  private AiProviderType provider;

  @Enumerated(EnumType.STRING)
  @Column(name = "capability", nullable = false, length = 32)
  private AiCapability capability;

  @Enumerated(EnumType.STRING)
  @Column(name = "request_kind", nullable = false, length = 64)
  private AiRequestKind requestKind;

  @Column(name = "model", length = 255)
  private String model;

  @Column(name = "success", nullable = false)
  private boolean success;

  @Column(name = "failure_reason", length = 255)
  private String failureReason;

  @Column(name = "latency_ms")
  private Long latencyMs;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }
}
