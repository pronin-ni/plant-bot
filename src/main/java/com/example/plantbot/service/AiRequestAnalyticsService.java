package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminAiAnalyticsResponse;
import com.example.plantbot.controller.dto.admin.AdminAiAnalyticsRowResponse;
import com.example.plantbot.domain.AiAnalyticsPeriod;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestEvent;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.repository.AiRequestEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiRequestAnalyticsService {
  private final AiRequestEventRepository aiRequestEventRepository;

  @Transactional
  public void record(
      AiRequestKind requestKind,
      AiProviderType provider,
      AiCapability capability,
      String model,
      boolean success,
      String failureReason,
      Long latencyMs
  ) {
    AiRequestEvent event = new AiRequestEvent();
    event.setRequestKind(requestKind == null ? AiRequestKind.OTHER_AI_REQUEST : requestKind);
    event.setProvider(provider == null ? AiProviderType.OPENROUTER : provider);
    event.setCapability(capability == null ? AiCapability.TEXT : capability);
    event.setModel(normalize(model));
    event.setSuccess(success);
    event.setFailureReason(normalizeFailure(failureReason));
    event.setLatencyMs(latencyMs == null || latencyMs < 0 ? null : latencyMs);
    aiRequestEventRepository.save(event);
  }

  @Transactional(readOnly = true)
  public AdminAiAnalyticsResponse analytics(AiAnalyticsPeriod period) {
    AiAnalyticsPeriod effectivePeriod = period == null ? AiAnalyticsPeriod.DAY : period;
    Instant from = Instant.now().minus(effectivePeriod.duration());
    long total = aiRequestEventRepository.countSince(from);
    long success = safeLong(aiRequestEventRepository.countSuccessSince(from));
    long failed = safeLong(aiRequestEventRepository.countFailureSince(from));
    List<AdminAiAnalyticsRowResponse> rows = aiRequestEventRepository.aggregateSince(from).stream()
        .map(row -> new AdminAiAnalyticsRowResponse(
            row.requestKind().name(),
            row.provider().name(),
            row.model(),
            row.total(),
            row.success(),
            row.failed(),
            row.lastSuccessAt(),
            row.lastFailureAt()
        ))
        .toList();
    return new AdminAiAnalyticsResponse(effectivePeriod.name(), from, total, success, failed, rows);
  }

  @Transactional
  public long cleanupOlderThan(Instant threshold) {
    return aiRequestEventRepository.deleteByCreatedAtBefore(threshold);
  }

  private long safeLong(Long value) {
    return value == null ? 0L : value;
  }

  private String normalize(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
  }

  private String normalizeFailure(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
  }

  public record AnalyticsRow(
      AiRequestKind requestKind,
      AiProviderType provider,
      String model,
      long total,
      long success,
      long failed,
      Instant lastSuccessAt,
      Instant lastFailureAt
  ) {
  }
}
