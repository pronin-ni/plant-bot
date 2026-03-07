package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.pwa.PwaMigrationAnalyticsRequest;
import com.example.plantbot.controller.dto.pwa.PwaMigrationDecisionResponse;
import com.example.plantbot.controller.dto.pwa.PwaMigrationStatsResponse;
import com.example.plantbot.controller.dto.pwa.PwaMigrationTrackRequest;
import com.example.plantbot.controller.dto.pwa.PwaMigrationTrackResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.MigrationAnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequiredArgsConstructor
public class PwaMigrationController {
  private final CurrentUserService currentUserService;
  private final MigrationAnalyticsService migrationAnalyticsService;

  @GetMapping("/api/pwa/migration/decision")
  public PwaMigrationDecisionResponse decision(
      Authentication authentication,
      @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return migrationAnalyticsService.decision(user);
  }

  @PostMapping("/api/pwa/migration/track")
  public PwaMigrationTrackResponse track(
      Authentication authentication,
      @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody(required = false) PwaMigrationTrackRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String source = request == null ? null : request.source();
    String event = request == null ? null : request.event();
    String meta = request == null ? null : request.meta();
    migrationAnalyticsService.track(user, source, event, meta);
    return new PwaMigrationTrackResponse(true);
  }

  @PostMapping("/api/analytics/migration")
  public PwaMigrationTrackResponse analyticsTrack(
      Authentication authentication,
      @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody(required = false) PwaMigrationAnalyticsRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String mappedSource = request == null ? null : request.source();
    String mappedEvent = request == null ? null : request.event();
    if ((mappedSource == null || mappedSource.isBlank()) || (mappedEvent == null || mappedEvent.isBlank())) {
      String type = request == null ? "" : (request.type() == null ? "" : request.type().trim().toLowerCase());
      switch (type) {
        case "migration_started" -> {
          mappedSource = "tma";
          mappedEvent = "pwa_open_clicked";
        }
        case "migration_completed" -> {
          mappedSource = "pwa";
          mappedEvent = "migration_success";
        }
        case "pwa_engaged" -> {
          mappedSource = "pwa";
          mappedEvent = "app_open";
        }
        default -> {
          mappedSource = "pwa";
          mappedEvent = "app_open";
        }
      }
    }
    String meta = request == null ? null : request.meta();
    migrationAnalyticsService.track(user, mappedSource, mappedEvent, meta);
    return new PwaMigrationTrackResponse(true);
  }

  @GetMapping("/api/analytics/migration/stats")
  @PreAuthorize("hasRole('ADMIN')")
  public PwaMigrationStatsResponse analyticsStats() {
    MigrationAnalyticsService.MigrationKpi kpi = migrationAnalyticsService.stats();
    long tmaUsers = Math.max(0, kpi.totalUsers() - kpi.pwaUsers());
    return new PwaMigrationStatsResponse(
        kpi.pwaUsers(),
        tmaUsers,
        kpi.pwaSharePct(),
        Instant.now()
    );
  }
}
