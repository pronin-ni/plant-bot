package com.example.plantbot.service;

import com.example.plantbot.domain.GlobalSettings;
import com.example.plantbot.domain.OpenRouterModelAvailabilityStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenRouterModelHealthServiceTest {
  @Mock
  private OpenRouterGlobalSettingsService settingsService;

  @Mock
  private OpenRouterModelAvailabilityPersistenceService persistenceService;

  private OpenRouterModelHealthService service;

  @BeforeEach
  void setUp() {
    service = new OpenRouterModelHealthService(settingsService, persistenceService);
    GlobalSettings settings = new GlobalSettings();
    settings.setChatModel("model/test");
    settings.setTextModelAvailabilityStatus(OpenRouterModelAvailabilityStatus.UNKNOWN);
    lenient().when(settingsService.getOrCreate()).thenReturn(settings);
    lenient().when(settingsService.resolveModels(any())).thenReturn(new OpenRouterGlobalSettingsService.ResolvedModels("model/test", null, null));
    lenient().when(settingsService.resolveDegradedFailureThreshold()).thenReturn(2);
    lenient().when(settingsService.resolveUnavailableFailureThreshold()).thenReturn(4);
    lenient().when(settingsService.resolveRecoveryRecheckIntervalMinutes()).thenReturn(5);
  }

  @Test
  void shouldMarkTrackedModelDegradedThenUnavailable() {
    service.recordFailure(OpenRouterModelKind.TEXT, "model/test", OpenRouterFailureType.TIMEOUT, "timeout");
    verify(persistenceService, never()).markStatus(any(), any(), any(), any(), anyBoolean());

    service.recordFailure(OpenRouterModelKind.TEXT, "model/test", OpenRouterFailureType.TIMEOUT, "timeout");
    verify(persistenceService).markStatus(eq(OpenRouterModelKind.TEXT), eq(OpenRouterModelAvailabilityStatus.DEGRADED), eq("timeout"), any(), eq(false));

    service.recordFailure(OpenRouterModelKind.TEXT, "model/test", OpenRouterFailureType.TIMEOUT, "timeout");
    service.recordFailure(OpenRouterModelKind.TEXT, "model/test", OpenRouterFailureType.TIMEOUT, "timeout");
    verify(persistenceService).markStatus(eq(OpenRouterModelKind.TEXT), eq(OpenRouterModelAvailabilityStatus.UNAVAILABLE), eq("timeout"), any(), eq(false));
  }

  @Test
  void shouldIgnoreUntrackedFallbackModel() {
    service.recordFailure(OpenRouterModelKind.TEXT, "fallback/model", OpenRouterFailureType.TIMEOUT, "timeout");
    verify(persistenceService, never()).markStatus(any(), any(), any(), any(), anyBoolean());
  }
}
