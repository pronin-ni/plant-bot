package com.example.plantbot.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
  private String city;
  private String cityDisplayName;
  private Double cityLat;
  private Double cityLon;
  private Boolean calendarSyncEnabled = false;
  @Column(nullable = false, unique = true)
  private String calendarToken = UUID.randomUUID().toString();

  private Instant createdAt = Instant.now();

  @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<Plant> plants = new ArrayList<>();
}
