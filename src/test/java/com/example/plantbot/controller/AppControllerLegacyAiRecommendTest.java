package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.PlantAiRecommendRequest;
import com.example.plantbot.controller.dto.PlantAiRecommendResponse;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.service.AiTextCacheInvalidationService;
import com.example.plantbot.service.AssistantChatHistoryService;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.OpenRouterModelCatalogService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.OpenRouterUserSettingsService;
import com.example.plantbot.service.PhotoUrlSignerService;
import com.example.plantbot.service.PlantCatalogService;
import com.example.plantbot.service.PlantMutationService;
import com.example.plantbot.service.PlantPresetCatalogService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.RecommendationSnapshotService;
import com.example.plantbot.service.SeedLifecycleService;
import com.example.plantbot.service.UserService;
import com.example.plantbot.service.WateringLogService;
import com.example.plantbot.service.WateringRecommendationService;
import com.example.plantbot.service.WeatherService;
import com.example.plantbot.service.recommendation.facade.RecommendationFacade;
import com.example.plantbot.service.recommendation.mapper.LegacyPlantAiRecommendContextMapper;
import com.example.plantbot.service.recommendation.mapper.LegacyPlantAiRecommendResponseAdapter;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.example.plantbot.service.recommendation.model.RecommendationRequestContext;
import com.example.plantbot.service.recommendation.model.RecommendationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AppControllerLegacyAiRecommendTest {

  @Mock private CurrentUserService currentUserService;
  @Mock private PlantService plantService;
  @Mock private PlantRepository plantRepository;
  @Mock private WateringRecommendationService wateringRecommendationService;
  @Mock private WateringLogService wateringLogService;
  @Mock private PlantMutationService plantMutationService;
  @Mock private UserService userService;
  @Mock private UserRepository userRepository;
  @Mock private AssistantChatHistoryService assistantChatHistoryService;
  @Mock private PlantCatalogService plantCatalogService;
  @Mock private PlantPresetCatalogService plantPresetCatalogService;
  @Mock private PhotoUrlSignerService photoUrlSignerService;
  @Mock private OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  @Mock private OpenRouterUserSettingsService openRouterUserSettingsService;
  @Mock private OpenRouterModelCatalogService openRouterModelCatalogService;
  @Mock private WeatherService weatherService;
  @Mock private SeedLifecycleService seedLifecycleService;
  @Mock private RecommendationSnapshotService recommendationSnapshotService;
  @Mock private AiTextCacheInvalidationService aiTextCacheInvalidationService;
  @Mock private RecommendationFacade recommendationFacade;
  @Mock private LegacyPlantAiRecommendContextMapper requestMapper;
  @Mock private LegacyPlantAiRecommendResponseAdapter responseAdapter;
  @Mock private com.example.plantbot.service.recommendation.persistence.RecommendationExplainabilityPersistenceMapper explainabilityPersistenceMapper;
  @Mock private com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePolicy recommendationPersistencePolicy;
  @Mock private com.example.plantbot.service.recommendation.persistence.RecommendationPersistencePlanApplier recommendationPersistencePlanApplier;
  @Mock private Authentication authentication;

  @Test
  void aiRecommendEndpointActsAsThinWrapperAroundUnifiedPlatform() {
    AppController controller = new AppController(
        currentUserService,
        plantService,
        plantRepository,
        wateringRecommendationService,
        wateringLogService,
        plantMutationService,
        userService,
        userRepository,
        assistantChatHistoryService,
        plantCatalogService,
        plantPresetCatalogService,
        photoUrlSignerService,
        openRouterPlantAdvisorService,
        openRouterUserSettingsService,
        openRouterModelCatalogService,
        weatherService,
        seedLifecycleService,
        recommendationSnapshotService,
        aiTextCacheInvalidationService,
        recommendationFacade,
        requestMapper,
        responseAdapter,
        explainabilityPersistenceMapper,
        recommendationPersistencePolicy,
        recommendationPersistencePlanApplier,
        new ObjectMapper()
    );

    User user = new User();
    user.setId(5L);
    when(currentUserService.resolve(authentication, "init")).thenReturn(user);

    PlantAiRecommendRequest request = new PlantAiRecommendRequest(
        "Tomato",
        PlantEnvironmentType.OUTDOOR_GARDEN,
        null,
        PlantType.DEFAULT,
        5,
        3.0,
        null,
        120.0,
        "OPEN_GROUND",
        "FLOWERING",
        true,
        "LOAMY",
        "FULL_SUN",
        "Moscow region",
        true,
        true
    );

    RecommendationRequestContext context = org.mockito.Mockito.mock(RecommendationRequestContext.class);
    when(context.plantName()).thenReturn("Tomato");
    when(context.environmentType()).thenReturn(PlantEnvironmentType.OUTDOOR_GARDEN);
    RecommendationResult result = new RecommendationResult(
        4,
        700,
        "AI",
        RecommendationExecutionMode.AI,
        0.8,
        new RecommendationExplainability("AI", RecommendationExecutionMode.AI, "Summary", List.of("r1"), List.of("w1"), List.of(), null, null, null, null, null),
        null,
        null,
        Instant.now(),
        false
    );
    PlantAiRecommendResponse response = new PlantAiRecommendResponse("AI", 4, 700, "Summary", List.of("r1"), List.of("w1"), "OUTDOOR_GARDEN");

    when(requestMapper.map(user, request)).thenReturn(context);
    when(recommendationFacade.preview(context)).thenReturn(result);
    when(responseAdapter.adapt(result, context)).thenReturn(response);

    PlantAiRecommendResponse actual = controller.aiRecommendPlant("init", authentication, request);

    ArgumentCaptor<RecommendationRequestContext> contextCaptor = ArgumentCaptor.forClass(RecommendationRequestContext.class);
    verify(recommendationFacade).preview(contextCaptor.capture());
    assertEquals("Tomato", contextCaptor.getValue().plantName());
    assertEquals(PlantEnvironmentType.OUTDOOR_GARDEN, contextCaptor.getValue().environmentType());
    assertEquals(response, actual);
  }
}
