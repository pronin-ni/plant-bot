package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.repository.RecommendationSnapshotRepository;
import com.example.plantbot.service.recommendation.persistence.RecommendationSnapshotPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecommendationSnapshotServiceTest {

  @Mock
  private RecommendationSnapshotRepository snapshotRepository;

  private RecommendationSnapshotService service;

  @BeforeEach
  void setUp() {
    service = new RecommendationSnapshotService(snapshotRepository, new ObjectMapper());
    when(snapshotRepository.save(any(RecommendationSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void saveInitialOnCreatePreservesRecommendationJsonFieldsFromPlant() {
    Plant plant = new Plant();
    plant.setId(1L);
    plant.setBaseIntervalDays(5);
    plant.setPreferredWaterMl(420);
    plant.setRecommendedIntervalDays(5);
    plant.setRecommendedWaterVolumeMl(420);
    plant.setRecommendationSource(RecommendationSource.HYBRID);
    plant.setRecommendationSummary("Initial summary");
    plant.setRecommendationReasoningJson("[\"reason-1\"]");
    plant.setRecommendationWarningsJson("[\"warning-1\"]");
    plant.setConfidenceScore(0.77);
    plant.setGeneratedAt(Instant.parse("2026-03-28T10:00:00Z"));

    RecommendationSnapshot snapshot = service.saveInitialOnCreate(plant);

    assertNotNull(snapshot);
    ArgumentCaptor<RecommendationSnapshot> captor = ArgumentCaptor.forClass(RecommendationSnapshot.class);
    verify(snapshotRepository).save(captor.capture());
    RecommendationSnapshot saved = captor.getValue();
    assertEquals("[\"reason-1\"]", saved.getReasoningJson());
    assertEquals("[\"warning-1\"]", saved.getWarningsJson());
    assertEquals("Initial summary", saved.getSummary());
    assertEquals(0.77, saved.getConfidenceScore());
  }

  @Test
  void saveFromPayloadUsesRawJsonWithoutDoubleEncoding() {
    Plant plant = new Plant();
    plant.setId(2L);

    RecommendationSnapshot snapshot = service.saveFromPayload(
        plant,
        new RecommendationSnapshotPayload(
            RecommendationSource.MANUAL,
            3,
            500,
            "Manual snapshot",
            "[\"reason-a\"]",
            "[\"warning-a\"]",
            "{\"provider\":\"OPEN_METEO\"}",
            0.55,
            Instant.parse("2026-03-28T11:00:00Z")
        )
    );

    assertNotNull(snapshot);
    ArgumentCaptor<RecommendationSnapshot> captor = ArgumentCaptor.forClass(RecommendationSnapshot.class);
    verify(snapshotRepository).save(captor.capture());
    RecommendationSnapshot saved = captor.getValue();
    assertEquals("[\"reason-a\"]", saved.getReasoningJson());
    assertEquals("[\"warning-a\"]", saved.getWarningsJson());
    assertEquals("{\"provider\":\"OPEN_METEO\"}", saved.getWeatherContextSnapshotJson());
    assertEquals(Instant.parse("2026-03-28T11:00:00Z"), saved.getGeneratedAt());
  }
}
