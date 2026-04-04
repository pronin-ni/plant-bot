package com.example.plantbot.service;

import com.example.plantbot.controller.dto.admin.AdminAiAnalyticsResponse;
import com.example.plantbot.domain.AiAnalyticsPeriod;
import com.example.plantbot.domain.AiCapability;
import com.example.plantbot.domain.AiProviderType;
import com.example.plantbot.domain.AiRequestKind;
import com.example.plantbot.repository.AiRequestEventRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiRequestAnalyticsServiceTest {
  @Mock
  private AiRequestEventRepository aiRequestEventRepository;

  @Test
  void shouldBuildProviderAwareAnalyticsResponse() {
    AiRequestAnalyticsService service = new AiRequestAnalyticsService(aiRequestEventRepository);
    Instant lastSuccess = Instant.parse("2026-04-04T10:00:00Z");
    Instant lastFailure = Instant.parse("2026-04-04T11:00:00Z");

    when(aiRequestEventRepository.countSince(any())).thenReturn(12L);
    when(aiRequestEventRepository.countSuccessSince(any())).thenReturn(9L);
    when(aiRequestEventRepository.countFailureSince(any())).thenReturn(3L);
    when(aiRequestEventRepository.aggregateSince(any())).thenReturn(List.of(
        new AiAnalyticsAggregationRow(
            AiRequestKind.ASSISTANT_CHAT,
            AiProviderType.OPENAI,
            "gpt-4o-mini",
            7,
            6,
            1,
            lastSuccess,
            lastFailure
        )
    ));

    AdminAiAnalyticsResponse response = service.analytics(AiAnalyticsPeriod.DAY);

    assertEquals("DAY", response.period());
    assertEquals(12L, response.total());
    assertEquals(9L, response.success());
    assertEquals(3L, response.failed());
    assertEquals(1, response.rows().size());
    assertEquals("ASSISTANT_CHAT", response.rows().get(0).requestKind());
    assertEquals("OPENAI", response.rows().get(0).provider());
    assertEquals("gpt-4o-mini", response.rows().get(0).model());
    assertEquals(lastSuccess, response.rows().get(0).lastSuccessAt());
    assertEquals(lastFailure, response.rows().get(0).lastFailureAt());
  }

  @Test
  void shouldPersistAnalyticsEventMetadata() {
    AiRequestAnalyticsService service = new AiRequestAnalyticsService(aiRequestEventRepository);

    service.record(
        AiRequestKind.PHOTO_IDENTIFY,
        AiProviderType.OPENROUTER,
        AiCapability.VISION,
        "google/gemma-3-12b-it:free",
        false,
        "timeout",
        480L
    );

    verify(aiRequestEventRepository).save(any());
  }
}
