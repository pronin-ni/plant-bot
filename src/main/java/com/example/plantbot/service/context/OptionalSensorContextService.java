package com.example.plantbot.service.context;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
public class OptionalSensorContextService {
  private final Map<String, OptionalSensorContextProvider> providersById;
  private final OptionalSensorContextProvider fallbackProvider;
  private final String activeProviderId;

  public OptionalSensorContextService(
      List<OptionalSensorContextProvider> providers,
      @Value("${app.sensor-context.provider:NONE}") String activeProviderId
  ) {
    this.providersById = providers.stream()
        .collect(Collectors.toUnmodifiableMap(
            provider -> normalizeId(provider.providerId()),
            Function.identity(),
            (left, right) -> left
        ));
    this.fallbackProvider = this.providersById.getOrDefault("NONE", providers.stream()
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("No OptionalSensorContextProvider beans found")));
    this.activeProviderId = normalizeId(activeProviderId);
  }

  public WateringSensorContextDto resolveForPreview(User user, WateringRecommendationPreviewRequest request) {
    return activeProviderBean().resolveForPreview(user, request);
  }

  public WateringSensorContextDto resolveForPlant(User user, Plant plant) {
    return activeProviderBean().resolveForPlant(user, plant);
  }

  public String activeProviderId() {
    OptionalSensorContextProvider provider = providersById.get(activeProviderId);
    if (provider != null) {
      return provider.providerId();
    }
    return fallbackProvider.providerId();
  }

  private OptionalSensorContextProvider activeProviderBean() {
    OptionalSensorContextProvider provider = providersById.get(activeProviderId);
    if (provider != null) {
      return provider;
    }
    log.warn("Unknown optional sensor context provider '{}', fallback to '{}'.",
        activeProviderId, fallbackProvider.providerId());
    return fallbackProvider;
  }

  private static String normalizeId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "NONE";
    }
    return raw.trim().toUpperCase(Locale.ROOT);
  }
}
