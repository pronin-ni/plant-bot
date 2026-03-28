package com.example.plantbot.service.recommendation.persistence;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSource;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecommendationPersistencePolicyTest {

  private final DefaultRecommendationPersistencePolicy policy = new DefaultRecommendationPersistencePolicy();
  private final RecommendationPersistencePlanApplier applier = new RecommendationPersistencePlanApplier();

  @Test
  void createFlowWithRecommendationPayloadProducesCoherentBaselineAndAppliedState() {
    Plant plant = new Plant();
    plant.setBaseIntervalDays(7);
    plant.setPreferredWaterMl(300);

    RecommendationPersistencePlan plan = policy.buildPlan(
        plant,
        new RecommendationPersistenceCommand(
            5,
            450,
            RecommendationSource.HYBRID,
            "Create summary",
            "[\"reason-1\"]",
            "[\"warning-1\"]",
            0.82,
            null,
            true,
            false,
            450,
            true,
            "{\"provider\":\"OPEN_METEO\"}"
        ),
        RecommendationPersistenceFlow.CREATE
    );

    assertEquals(5, plan.baselineIntervalDays());
    assertEquals(450, plan.baselineWaterMl());
    assertEquals(5, plan.appliedIntervalDays());
    assertEquals(450, plan.appliedWaterMl());
    assertEquals(RecommendationSource.HYBRID, plan.appliedSource());
    assertFalse(plan.manualOverrideActive());
    assertEquals("Create summary", plan.appliedSummary());
    assertNotNull(plan.snapshotPayload());
    assertEquals("[\"reason-1\"]", plan.snapshotPayload().reasoningJson());
  }

  @Test
  void createFlowWithManualSourceMarksManualOverride() {
    Plant plant = new Plant();
    plant.setBaseIntervalDays(6);
    plant.setPreferredWaterMl(280);

    RecommendationPersistencePlan plan = policy.buildPlan(
        plant,
        new RecommendationPersistenceCommand(
            4,
            500,
            RecommendationSource.MANUAL,
            "Manual create",
            null,
            null,
            null,
            null,
            true,
            true,
            500,
            true,
            null
        ),
        RecommendationPersistenceFlow.CREATE
    );

    applier.apply(plant, plan);

    assertTrue(Boolean.TRUE.equals(plant.getManualOverrideActive()));
    assertEquals(500, plant.getManualWaterVolumeMl());
    assertEquals(4, plant.getBaseIntervalDays());
    assertEquals(500, plant.getPreferredWaterMl());
    assertEquals(RecommendationSource.MANUAL, plant.getRecommendationSource());
  }

  @Test
  void applyFlowNormalizesOutOfRangeValuesAndBuildsSnapshotPayload() {
    Plant plant = new Plant();
    plant.setBaseIntervalDays(9);
    plant.setPreferredWaterMl(350);

    RecommendationPersistencePlan plan = policy.buildPlan(
        plant,
        new RecommendationPersistenceCommand(
            0,
            20,
            null,
            "Apply summary",
            null,
            null,
            null,
            null,
            true,
            true,
            20,
            true,
            null
        ),
        RecommendationPersistenceFlow.APPLY
    );

    assertEquals(1, plan.appliedIntervalDays());
    assertEquals(50, plan.appliedWaterMl());
    assertEquals(RecommendationSource.MANUAL, plan.appliedSource());
    assertTrue(plan.manualOverrideActive());
    assertEquals(50, plan.manualWaterVolumeMl());
    assertNotNull(plan.snapshotPayload());
    assertEquals(50, plan.snapshotPayload().recommendedWaterVolumeMl());
  }
}
