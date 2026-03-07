package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(
    name = "auth_identities",
    indexes = {
        @Index(name = "idx_auth_provider_subject", columnList = "provider,providerSubject", unique = true),
        @Index(name = "idx_auth_email", columnList = "email")
    }
)
@Getter
@Setter
@NoArgsConstructor
public class AuthIdentity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false, fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private AuthProviderType provider;

  @Column(nullable = false)
  private String providerSubject;

  private String email;
  private Boolean emailVerified;

  private Instant createdAt = Instant.now();
  private Instant lastLoginAt = Instant.now();
}
