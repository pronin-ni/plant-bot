package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private Long telegramId;

  private String username;
  private String firstName;
  private String lastName;
  private String email;
  private String city;
  private String cityDisplayName;
  private Double cityLat;
  private Double cityLon;
  private Boolean calendarSyncEnabled = false;
  private String openrouterModelPlant;
  private String openrouterModelChat;
  private String openrouterModelPhotoIdentify;
  private String openrouterModelPhotoDiagnose;
  private String openrouterApiKeyEncrypted;
  private String migrationVariant;
  private Integer tmaOpenCount = 0;
  private Integer pwaOpenCount = 0;
  private Instant migrationMigratedAt;
  private Instant lastSeenTmaAt;
  private Instant lastSeenPwaAt;
  @Column(name = "calendar_token")
  private String calendarToken = UUID.randomUUID().toString();

  @ElementCollection(fetch = FetchType.EAGER)
  @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
  @Enumerated(EnumType.STRING)
  @Column(name = "role", nullable = false)
  private Set<UserRole> roles = new HashSet<>(Set.of(UserRole.ROLE_USER));

  private Instant createdAt = Instant.now();

  @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<Plant> plants = new ArrayList<>();
}
