package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "magic_link_audit_events",
    indexes = {
        @Index(name = "idx_magic_link_audit_created_at", columnList = "createdAt"),
        @Index(name = "idx_magic_link_audit_email_masked", columnList = "emailMasked"),
        @Index(name = "idx_magic_link_audit_ip", columnList = "ipAddress")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class MagicLinkAuditEvent {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  @Column(nullable = false, length = 64)
  private String eventType;

  @Column(nullable = false)
  private Boolean success;

  @Column(length = 255)
  private String emailMasked;

  @Column(length = 128)
  private String ipAddress;

  private Long userId;

  @Column(length = 512)
  private String message;
}

