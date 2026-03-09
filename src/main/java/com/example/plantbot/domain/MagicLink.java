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
    name = "magic_links",
    indexes = {
        @Index(name = "idx_magic_links_token", columnList = "token", unique = true),
        @Index(name = "idx_magic_links_email", columnList = "email"),
        @Index(name = "idx_magic_links_expires_at", columnList = "expiresAt")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class MagicLink {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String email;

  @Column(nullable = false, unique = true, length = 120)
  private String token;

  @Column(nullable = false)
  private Instant expiresAt;

  @Column(nullable = false)
  private Boolean used = false;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  private Instant usedAt;
}
