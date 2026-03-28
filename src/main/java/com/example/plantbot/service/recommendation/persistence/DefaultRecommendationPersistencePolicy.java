package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSource;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class DefaultRecommendationPersistencePolicy implements RecommendationPersistencePolicy {

  @Override
  public RecommendationPersistencePlan buildPlan(
      Plant plant,
      RecommendationPersistenceCommand command,
      RecommendationPersistenceFlow flow
  ) {
    if (plant == null) {
      throw new IllegalArgumentException("plant is required");
    }
    if (command == null) {
      throw new IllegalArgumentException("command is required");
    }
    if (flow == null) {
      throw new IllegalArgumentException("flow is required");
    }

    int fallbackInterval = positiveOrDefault(plant.getBaseIntervalDays(), 7);
    int fallbackWater = positiveOrDefault(firstPositive(
        plant.getPreferredWaterMl(),
        plant.getManualWaterVolumeMl(),
        plant.getRecommendedWaterVolumeMl()
    ), 300);

    int appliedInterval = clampInterval(command.appliedIntervalDays() == null ? fallbackInterval : command.appliedIntervalDays());
    int appliedWater = clampWater(command.appliedWaterMl() == null ? fallbackWater : command.appliedWaterMl());
    RecommendationSource appliedSource = command.source() == null ? defaultSource(flow) : command.source();
    Instant eventTime = command.generatedAt() == null ? Instant.now() : command.generatedAt();

    Integer baselineInterval = command.updateBaseline() ? appliedInterval : plant.getBaseIntervalDays();
    Integer baselineWater = command.updateBaseline() ? appliedWater : plant.getPreferredWaterMl();
    Integer manualWaterVolumeMl = command.manualOverrideActive()
        ? clampWater(command.manualWaterVolumeMl() == null ? appliedWater : command.manualWaterVolumeMl())
        : null;

    RecommendationSnapshotPayload snapshotPayload = command.writeSnapshot()
        ? new RecommendationSnapshotPayload(
            appliedSource,
            appliedInterval,
            appliedWater,
            command.summary(),
            command.reasoningJson(),
            command.warningsJson(),
            command.weatherContextSnapshotJson(),
            command.confidenceScore(),
            eventTime
        )
        : null;

    return new RecommendationPersistencePlan(
        flow,
        baselineInterval,
        baselineWater,
        appliedInterval,
        appliedWater,
        appliedSource,
        command.summary(),
        command.reasoningJson(),
        command.warningsJson(),
        command.confidenceScore(),
        eventTime,
        command.manualOverrideActive(),
        manualWaterVolumeMl,
        appliedSource,
        appliedInterval,
        appliedWater,
        command.summary(),
        eventTime,
        snapshotPayload
    );
  }

  private RecommendationSource defaultSource(RecommendationPersistenceFlow flow) {
    return switch (flow) {
      case CREATE -> RecommendationSource.BASE_PROFILE;
      case APPLY, SEED_MIGRATION -> RecommendationSource.MANUAL;
      case REFRESH -> RecommendationSource.HYBRID;
      case SCHEDULED -> RecommendationSource.HEURISTIC;
    };
  }

  private Integer firstPositive(Integer... values) {
    if (values == null) {
      return null;
    }
    for (Integer value : values) {
      if (value != null && value > 0) {
        return value;
      }
    }
    return null;
  }

  private int positiveOrDefault(Integer value, int fallback) {
    return value == null || value <= 0 ? fallback : value;
  }

  private int clampInterval(Integer value) {
    int normalized = value == null ? 7 : value;
    return Math.max(1, Math.min(30, normalized));
  }

  private int clampWater(Integer value) {
    int normalized = value == null ? 300 : value;
    return Math.max(50, Math.min(10_000, normalized));
  }
}
