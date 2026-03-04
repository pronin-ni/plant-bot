package com.example.plantbot.domain.ha;

import com.example.plantbot.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "home_assistant_connections")
@Getter
@Setter
@NoArgsConstructor
public class HomeAssistantConnection {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false, unique = true)
  private User user;

  @Column(nullable = false)
  private String baseUrl;

  @Column(nullable = false, length = 4096)
  private String encryptedToken;

  @Column(nullable = false)
  private boolean connected;

  private String instanceName;
  private Instant lastSuccessAt;
  private Instant lastFailureAt;
  private Integer consecutiveFailures = 0;
  private Instant lastUnavailableAlertAt;
  private Instant createdAt = Instant.now();
  private Instant updatedAt = Instant.now();
}
