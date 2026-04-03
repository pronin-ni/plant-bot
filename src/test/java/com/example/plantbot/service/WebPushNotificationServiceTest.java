package com.example.plantbot.service;

import com.example.plantbot.repository.WebPushSubscriptionRepository;
import com.example.plantbot.service.notification.SmartNotificationFormatter;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import com.example.plantbot.service.recommendation.model.RecommendationExplainability;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@ExtendWith(MockitoExtension.class)
class WebPushNotificationServiceTest {

  @Mock
  private WebPushSubscriptionRepository subscriptionRepository;

  @Mock
  private SmartNotificationFormatter smartNotificationFormatter;

  @Test
  void notificationSnippetUsesMeaningfulSummaryAndFiltersTechnicalOne() {
    WebPushNotificationService service = new WebPushNotificationService(subscriptionRepository, new ObjectMapper(), smartNotificationFormatter);

    String normal = service.toNotificationExplainabilitySnippet(
        new RecommendationExplainability(
            "HYBRID",
            RecommendationExecutionMode.HYBRID,
            "Учтена текущая погода и история полива.",
            List.of(),
            List.of(),
            List.of(),
            "weather",
            null,
            null,
            "learning",
            null
        )
    );
    assertEquals("Учтена текущая погода и история полива.", normal);

    String technical = service.toNotificationExplainabilitySnippet(
        new RecommendationExplainability(
            "HYBRID",
            RecommendationExecutionMode.HYBRID,
            "Runtime recommendation generated through unified facade.",
            List.of(),
            List.of("Погодный контекст в degraded mode."),
            List.of(),
            "weather",
            null,
            null,
            "learning",
            null
        )
    );
    assertEquals("Погодный контекст в degraded mode.", technical);
  }

  @Test
  void notificationSnippetFallsBackToManualWeatherAndLearningContributions() {
    WebPushNotificationService service = new WebPushNotificationService(subscriptionRepository, new ObjectMapper(), smartNotificationFormatter);

    String manual = service.toNotificationExplainabilitySnippet(
        new RecommendationExplainability(
            "MANUAL",
            RecommendationExecutionMode.MANUAL,
            null,
            List.of(),
            List.of(),
            List.of(),
            null,
            null,
            null,
            null,
            "Manual override active"
        )
    );
    assertEquals("Используется ручная настройка полива.", manual);

    String learning = service.toNotificationExplainabilitySnippet(
        new RecommendationExplainability(
            "HEURISTIC",
            RecommendationExecutionMode.HEURISTIC,
            "Runtime recommendation generated through unified facade.",
            List.of(),
            List.of(),
            List.of(),
            null,
            null,
            null,
            "Использована история полива.",
            null
        )
    );
    assertEquals("Учтена история полива.", learning);

    String empty = service.toNotificationExplainabilitySnippet(
        new RecommendationExplainability(
            "HEURISTIC",
            RecommendationExecutionMode.HEURISTIC,
            "Runtime recommendation generated through unified facade.",
            List.of(),
            List.of(),
            List.of(),
            null,
            null,
            null,
            null,
            null
        )
    );
    assertNull(empty);
  }
}
