package com.example.plantbot.service;

import com.example.plantbot.controller.dto.WateringRecommendationResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSnapshot;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.repository.RecommendationSnapshotRepository;
import com.example.plantbot.service.recommendation.persistence.RecommendationSnapshotPayload;
import com.example.plantbot.util.WateringRecommendation;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class RecommendationSnapshotService {
  private final RecommendationSnapshotRepository snapshotRepository;
  private final ObjectMapper objectMapper;

  public RecommendationSnapshot saveFromResponse(Plant plant, WateringRecommendationResponse response) {
    if (plant == null || response == null) {
      return null;
    }
    return saveSnapshot(
        plant,
        response.source() == null ? RecommendationSource.FALLBACK : response.source(),
        response.recommendedIntervalDays(),
        response.recommendedWaterVolumeMl() == null ? response.recommendedWaterMl() : response.recommendedWaterVolumeMl(),
        response.summary(),
        response.reasoning(),
        response.warnings(),
        response.weatherContextPreview(),
        response.confidence(),
        Instant.now()
    );
  }

  public RecommendationSnapshot saveInitialOnCreate(Plant plant) {
    if (plant == null || plant.getId() == null) {
      return null;
    }
    int interval = plant.getRecommendedIntervalDays() == null
        ? Math.max(1, plant.getBaseIntervalDays())
        : plant.getRecommendedIntervalDays();
    int water = plant.getRecommendedWaterVolumeMl() == null
        ? defaultWaterMl(plant)
        : plant.getRecommendedWaterVolumeMl();
    RecommendationSource source = plant.getRecommendationSource() == null
        ? RecommendationSource.BASE_PROFILE
        : plant.getRecommendationSource();
    return saveSnapshotRawJson(
        plant,
        source,
        interval,
        water,
        plant.getRecommendationSummary() == null
            ? "Initial recommendation snapshot on plant create."
            : plant.getRecommendationSummary(),
        plant.getRecommendationReasoningJson(),
        plant.getRecommendationWarningsJson(),
        null,
        plant.getConfidenceScore(),
        plant.getGeneratedAt() == null ? Instant.now() : plant.getGeneratedAt()
    );
  }

  public RecommendationSnapshot saveScheduledHeuristicSnapshot(Plant plant, WateringRecommendation recommendation) {
    if (plant == null || recommendation == null) {
      return null;
    }
    int interval = Math.max(1, (int) Math.round(recommendation.intervalDays()));
    int waterMl = Math.max(50, (int) Math.round(recommendation.waterLiters() * 1000.0));
    return saveSnapshot(
        plant,
        RecommendationSource.HEURISTIC,
        interval,
        waterMl,
        "Scheduled heuristic recalculation.",
        List.of("Calculated by scheduler legacy heuristic path."),
        List.of(),
        null,
        null,
        Instant.now()
    );
  }

  public RecommendationSnapshot saveManualSnapshot(Plant plant,
                                                   RecommendationSource source,
                                                   Integer intervalDays,
                                                   Integer waterMl,
                                                   String summary) {
    return saveSnapshot(
        plant,
        source == null ? RecommendationSource.MANUAL : source,
        intervalDays == null ? Math.max(1, plant.getBaseIntervalDays()) : intervalDays,
        waterMl == null ? defaultWaterMl(plant) : waterMl,
        summary,
        List.of(),
        List.of(),
        null,
        null,
        Instant.now()
    );
  }

  public RecommendationSnapshot saveFromPayload(Plant plant, RecommendationSnapshotPayload payload) {
    if (plant == null || payload == null) {
      return null;
    }
    return saveSnapshotRawJson(
        plant,
        payload.source(),
        payload.recommendedIntervalDays(),
        payload.recommendedWaterVolumeMl(),
        payload.summary(),
        payload.reasoningJson(),
        payload.warningsJson(),
        payload.weatherContextSnapshotJson(),
        payload.confidenceScore(),
        payload.generatedAt()
    );
  }

  public List<RecommendationSnapshot> listForPlant(Plant plant, int limit) {
    int normalizedLimit = Math.max(1, Math.min(100, limit));
    if (normalizedLimit <= 50) {
      return snapshotRepository.findTop50ByPlantOrderByCreatedAtDesc(plant)
          .stream()
          .limit(normalizedLimit)
          .toList();
    }
    return snapshotRepository.findTop100ByPlantOrderByCreatedAtDesc(plant)
        .stream()
        .limit(normalizedLimit)
        .toList();
  }

  public RecommendationSnapshot getLatestForPlant(Plant plant) {
    if (plant == null || plant.getId() == null) {
      return null;
    }
    return snapshotRepository.findTop1ByPlantOrderByCreatedAtDesc(plant);
  }

  private RecommendationSnapshot saveSnapshot(Plant plant,
                                              RecommendationSource source,
                                              Integer intervalDays,
                                              Integer waterMl,
                                              String summary,
                                              Object reasoning,
                                              Object warnings,
                                              Object weatherContextSnapshot,
                                              Double confidence,
                                              Instant generatedAt) {
    return saveSnapshotRawJson(
        plant,
        source,
        intervalDays,
        waterMl,
        summary,
        toJson(reasoning),
        toJson(warnings),
        toJson(weatherContextSnapshot),
        confidence,
        generatedAt
    );
  }

  private RecommendationSnapshot saveSnapshotRawJson(Plant plant,
                                                     RecommendationSource source,
                                                     Integer intervalDays,
                                                     Integer waterMl,
                                                     String summary,
                                                     String reasoningJson,
                                                     String warningsJson,
                                                     String weatherContextSnapshotJson,
                                                     Double confidence,
                                                     Instant generatedAt) {
    if (plant == null || plant.getId() == null) {
      return null;
    }
    RecommendationSnapshot snapshot = new RecommendationSnapshot();
    snapshot.setPlant(plant);
    snapshot.setSource(source == null ? RecommendationSource.FALLBACK : source);
    snapshot.setRecommendedIntervalDays(Math.max(1, intervalDays == null ? 7 : intervalDays));
    snapshot.setRecommendedWaterVolumeMl(Math.max(50, waterMl == null ? 300 : waterMl));
    snapshot.setSummary(summary);
    snapshot.setReasoningJson(reasoningJson);
    snapshot.setWarningsJson(warningsJson);
    snapshot.setWeatherContextSnapshotJson(weatherContextSnapshotJson);
    snapshot.setConfidenceScore(confidence);
    snapshot.setGeneratedAt(generatedAt == null ? Instant.now() : generatedAt);
    return snapshotRepository.save(snapshot);
  }

  private String toJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      return null;
    }
  }

  private int defaultWaterMl(Plant plant) {
    if (plant.getPreferredWaterMl() != null && plant.getPreferredWaterMl() > 0) {
      return plant.getPreferredWaterMl();
    }
    if (plant.getManualWaterVolumeMl() != null && plant.getManualWaterVolumeMl() > 0) {
      return plant.getManualWaterVolumeMl();
    }
    return 300;
  }
}
