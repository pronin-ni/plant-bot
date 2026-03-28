package com.example.plantbot.service;

import com.example.plantbot.controller.dto.ApplyWateringRecommendationRequest;
import com.example.plantbot.controller.dto.ApplyWateringRecommendationResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.context.OptionalSensorContextService;
import com.example.plantbot.service.recommendation.mapper.PlantRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationContextMapper;
import com.example.plantbot.service.recommendation.mapper.PreviewRecommendationResponseAdapter;
import com.example.plantbot.service.recommendation.mapper.LocationContextResolver;
import com.example.plantbot.service.recommendation.mapper.RecommendationContextMapperSupport;
import com.example.plantbot.service.recommendation.mapper.WeatherContextAdapter;
import com.example.plantbot.service.recommendation.mapper.WeatherContextResolver;
import com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper;
import com.example.plantbot.service.recommendation.persistence.DefaultRecommendationPersistencePolicy;
import com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WateringRecommendationApplyPersistenceTest {

  @Mock
  private WateringRecommendationEngine recommendationEngine;
  @Mock
  private PlantService plantService;
  @Mock
  private OutdoorWeatherContextService outdoorWeatherContextService;
  @Mock
  private RecommendationSnapshotService recommendationSnapshotService;
  @Mock
  private AiTextCacheInvalidationService aiTextCacheInvalidationService;
  @Mock
  private PreviewRecommendationContextMapper previewRecommendationContextMapper;
  @Mock
  private PlantRecommendationContextMapper plantRecommendationContextMapper;
  @Mock
  private RecommendationFacade recommendationFacade;
  @Mock
  private PreviewRecommendationResponseAdapter previewRecommendationResponseAdapter;
  @Mock
  private OptionalSensorContextService optionalSensorContextService;

  private WateringRecommendationPreviewService service;

  @BeforeEach
  void setUp() {
    service = new WateringRecommendationPreviewService(
        recommendationEngine,
        plantService,
        outdoorWeatherContextService,
        recommendationSnapshotService,
        aiTextCacheInvalidationService,
        optionalSensorContextService,
        previewRecommendationContextMapper,
        plantRecommendationContextMapper,
        recommendationFacade,
        previewRecommendationResponseAdapter,
        new RecommendationExplainabilityPersistenceMapper(new ObjectMapper()),
        new DefaultRecommendationPersistencePolicy(),
        new RecommendationPersistencePlanApplier(),
        new ObjectMapper()
    );
    when(plantService.save(org.mockito.ArgumentMatchers.any(Plant.class))).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void applyRecommendationPersistsAppliedAndBaselineStateThroughPolicy() {
    User user = new User();
    user.setId(99L);

    Plant plant = new Plant();
    plant.setId(12L);
    plant.setBaseIntervalDays(7);
    plant.setPreferredWaterMl(300);

    ApplyWateringRecommendationResponse response = service.applyRecommendation(
        user,
        plant,
        new ApplyWateringRecommendationRequest(RecommendationSource.HYBRID, 4, 550, "Accepted preview")
    );

    assertEquals(4, plant.getBaseIntervalDays());
    assertEquals(550, plant.getPreferredWaterMl());
    assertEquals(4, plant.getRecommendedIntervalDays());
    assertEquals(550, plant.getRecommendedWaterVolumeMl());
    assertEquals(RecommendationSource.HYBRID, plant.getRecommendationSource());
    assertEquals("Accepted preview", plant.getRecommendationSummary());
    assertTrue(Boolean.FALSE.equals(plant.getManualOverrideActive()));
    assertEquals(null, plant.getManualWaterVolumeMl());
    assertNotNull(plant.getGeneratedAt());
    assertNotNull(plant.getLastRecommendationUpdatedAt());
    assertEquals(RecommendationSource.HYBRID, response.source());
    assertEquals(4, response.baseIntervalDays());
    assertEquals(550, response.preferredWaterMl());

    verify(plantService).save(eq(plant));
    verify(recommendationSnapshotService).saveFromPayload(eq(plant), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void applyRecommendationDefaultsToManualAndMarksManualOverride() {
    User user = new User();
    user.setId(100L);

    Plant plant = new Plant();
    plant.setId(15L);
    plant.setBaseIntervalDays(6);
    plant.setPreferredWaterMl(280);

    service.applyRecommendation(
        user,
        plant,
        new ApplyWateringRecommendationRequest(null, 3, 480, "Manual accept")
    );

    assertEquals(RecommendationSource.MANUAL, plant.getRecommendationSource());
    assertTrue(Boolean.TRUE.equals(plant.getManualOverrideActive()));
    assertEquals(480, plant.getManualWaterVolumeMl());

    ArgumentCaptor<com.example.plantbot.service.recommendation.persistence.RecommendationSnapshotPayload> payloadCaptor =
        ArgumentCaptor.forClass(com.example.plantbot.service.recommendation.persistence.RecommendationSnapshotPayload.class);
    verify(recommendationSnapshotService).saveFromPayload(eq(plant), payloadCaptor.capture());
    assertEquals(RecommendationSource.MANUAL, payloadCaptor.getValue().source());
    assertEquals(3, payloadCaptor.getValue().recommendedIntervalDays());
    assertEquals(480, payloadCaptor.getValue().recommendedWaterVolumeMl());
    assertEquals("Manual accept", payloadCaptor.getValue().summary());
  }
}
