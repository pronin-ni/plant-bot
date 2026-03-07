package com.example.plantbot.service;

import com.example.plantbot.controller.dto.pwa.PwaMigrationDecisionResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class MigrationAnalyticsService {
  private final UserRepository userRepository;

  @Value("${app.public-base-url:http://localhost:8080}")
  private String publicBaseUrl;

  @Value("${app.migration.rollout-percent:50}")
  private int rolloutPercent;

  @Value("${app.migration.prompt-after-tma-opens:2}")
  private int promptAfterTmaOpens;

  @Value("${app.migration.auto-open-after-tma-opens:5}")
  private int autoOpenAfterTmaOpens;

  @Transactional
  public PwaMigrationDecisionResponse decision(User user) {
    String variant = ensureVariant(user);
    int tmaOpens = user.getTmaOpenCount() == null ? 0 : user.getTmaOpenCount();
    boolean migrated = user.getMigrationMigratedAt() != null;
    boolean treatment = "treatment".equals(variant);
    String pwaUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl + "mini-app/" : publicBaseUrl + "/mini-app/";
    return new PwaMigrationDecisionResponse(
        !"out".equals(variant),
        variant,
        Math.max(0, Math.min(100, rolloutPercent)),
        treatment && !migrated && tmaOpens >= Math.max(1, promptAfterTmaOpens),
        treatment && !migrated && tmaOpens >= Math.max(2, autoOpenAfterTmaOpens),
        pwaUrl
    );
  }

  @Transactional
  public void track(User user, String source, String event, String meta) {
    String normalizedSource = source == null ? "" : source.trim().toLowerCase();
    String normalizedEvent = event == null ? "" : event.trim().toLowerCase();
    ensureVariant(user);

    if ("tma".equals(normalizedSource) && "app_open".equals(normalizedEvent)) {
      user.setTmaOpenCount((user.getTmaOpenCount() == null ? 0 : user.getTmaOpenCount()) + 1);
      user.setLastSeenTmaAt(Instant.now());
    }
    if ("pwa".equals(normalizedSource) && "app_open".equals(normalizedEvent)) {
      user.setPwaOpenCount((user.getPwaOpenCount() == null ? 0 : user.getPwaOpenCount()) + 1);
      user.setLastSeenPwaAt(Instant.now());
    }
    if ("pwa".equals(normalizedSource) && ("login_success".equals(normalizedEvent) || "migration_success".equals(normalizedEvent))) {
      user.setLastSeenPwaAt(Instant.now());
      if (user.getMigrationMigratedAt() == null) {
        user.setMigrationMigratedAt(Instant.now());
      }
    }
    if ("tma".equals(normalizedSource) && "pwa_open_clicked".equals(normalizedEvent)) {
      user.setLastSeenTmaAt(Instant.now());
    }
    userRepository.save(user);
  }

  @Transactional(readOnly = true)
  public MigrationKpi stats() {
    long users = userRepository.count();
    long pwaUsers = userRepository.countByPwaOpenCountGreaterThan(0);
    long migratedUsers = userRepository.countByMigrationMigratedAtIsNotNull();
    long controlUsers = userRepository.countByMigrationVariant("control");
    long treatmentUsers = userRepository.countByMigrationVariant("treatment");
    long controlMigrated = userRepository.countByMigrationVariantAndMigrationMigratedAtIsNotNull("control");
    long treatmentMigrated = userRepository.countByMigrationVariantAndMigrationMigratedAtIsNotNull("treatment");

    double pwaShare = users == 0 ? 0.0 : (pwaUsers * 100.0 / users);
    double controlConv = controlUsers == 0 ? 0.0 : (controlMigrated * 100.0 / controlUsers);
    double treatmentConv = treatmentUsers == 0 ? 0.0 : (treatmentMigrated * 100.0 / treatmentUsers);

    return new MigrationKpi(users, pwaUsers, migratedUsers, pwaShare, controlUsers, treatmentUsers, controlConv, treatmentConv);
  }

  private String ensureVariant(User user) {
    if (user.getMigrationVariant() != null && !user.getMigrationVariant().isBlank()) {
      return user.getMigrationVariant();
    }
    long base = user.getTelegramId() != null ? Math.abs(user.getTelegramId()) : Math.abs(user.getId() == null ? 0L : user.getId());
    int bucket = (int) (base % 100L);
    int safeRollout = Math.max(0, Math.min(100, rolloutPercent));
    String variant;
    if (bucket >= safeRollout) {
      variant = "out";
    } else {
      variant = bucket % 2 == 0 ? "treatment" : "control";
    }
    user.setMigrationVariant(variant);
    userRepository.save(user);
    return variant;
  }

  public record MigrationKpi(
      long totalUsers,
      long pwaUsers,
      long migratedUsers,
      double pwaSharePct,
      long controlUsers,
      long treatmentUsers,
      double controlConversionPct,
      double treatmentConversionPct
  ) {
  }
}

