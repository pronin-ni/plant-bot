package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.admin.AdminMagicLinkAuditItemResponse;
import com.example.plantbot.domain.MagicLinkAuditEvent;
import com.example.plantbot.repository.MagicLinkAuditEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Slf4j
public class MagicLinkAuditService {
  private final MagicLinkAuditEventRepository magicLinkAuditEventRepository;

  @Value("${app.magic-link.audit-retention-days:30}")
  private int auditRetentionDays;

  @Transactional
  public void logEvent(String eventType, boolean success, String email, String ipAddress, String message, Long userId) {
    try {
      MagicLinkAuditEvent event = new MagicLinkAuditEvent();
      event.setCreatedAt(Instant.now());
      event.setEventType(safe(eventType, 64));
      event.setSuccess(success);
      event.setEmailMasked(maskEmail(email));
      event.setIpAddress(safe(ipAddress, 128));
      event.setMessage(safe(message, 512));
      event.setUserId(userId);
      magicLinkAuditEventRepository.save(event);
    } catch (Exception ex) {
      log.warn("Magic-link audit save failed: {}", ex.getMessage());
    }
  }

  @Transactional(readOnly = true)
  public List<AdminMagicLinkAuditItemResponse> latest(int limit) {
    int safeLimit = Math.max(1, Math.min(200, limit));
    return magicLinkAuditEventRepository.findByOrderByCreatedAtDesc(PageRequest.of(0, safeLimit)).stream()
        .map(item -> new AdminMagicLinkAuditItemResponse(
            item.getCreatedAt(),
            item.getEventType(),
            Boolean.TRUE.equals(item.getSuccess()),
            item.getEmailMasked(),
            item.getIpAddress(),
            item.getUserId(),
            item.getMessage()
        ))
        .toList();
  }

  @Scheduled(cron = "${app.magic-link.audit-cleanup-cron:0 15 4 * * *}")
  @Transactional
  public void cleanupOldAuditEvents() {
    int retentionDays = Math.max(1, auditRetentionDays);
    Instant threshold = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
    long deleted = magicLinkAuditEventRepository.deleteByCreatedAtBefore(threshold);
    if (deleted > 0) {
      log.info("Magic-link audit cleanup: removed {} old events", deleted);
    }
  }

  private String maskEmail(String email) {
    if (email == null || email.isBlank()) {
      return null;
    }
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    int at = normalized.indexOf('@');
    if (at <= 0 || at == normalized.length() - 1) {
      return "***";
    }
    String local = normalized.substring(0, at);
    String domain = normalized.substring(at + 1);
    String localMasked;
    if (local.length() <= 2) {
      localMasked = local.charAt(0) + "***";
    } else {
      localMasked = local.charAt(0) + "***" + local.charAt(local.length() - 1);
    }
    return localMasked + "@" + domain;
  }

  private String safe(String value, int limit) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String trimmed = value.trim();
    if (trimmed.length() <= limit) {
      return trimmed;
    }
    return trimmed.substring(0, Math.max(0, limit));
  }
}
