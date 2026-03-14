package com.example.plantbot.service.context;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.ha.HomeAssistantPlantContextService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HomeAssistantSensorContextProvider implements OptionalSensorContextProvider {
  private final HomeAssistantPlantContextService homeAssistantPlantContextService;

  @Override
  public String providerId() {
    return "HOME_ASSISTANT";
  }

  @Override
  public WateringSensorContextDto resolveForPreview(User user, WateringRecommendationPreviewRequest request) {
    return homeAssistantPlantContextService.resolveForPreview(user, request);
  }

  @Override
  public WateringSensorContextDto resolveForPlant(User user, Plant plant) {
    return homeAssistantPlantContextService.resolveForPlant(user, plant);
  }
}
