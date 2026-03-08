package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "web_push_subscription")
@Getter
@Setter
@NoArgsConstructor
public class WebPushSubscription {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(nullable = false, length = 1024, unique = true)
  private String endpoint;

  @Column(nullable = false, length = 512)
  private String p256dh;

  @Column(nullable = false, length = 512)
  private String auth;

  @Column(length = 255)
  private String userAgent;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  private Instant lastSuccessAt;
  private Instant lastFailureAt;

  @Column(length = 500)
  private String lastFailureReason;
}

