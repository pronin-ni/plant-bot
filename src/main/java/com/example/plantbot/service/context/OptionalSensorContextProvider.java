package com.example.plantbot.service.context;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;

public interface OptionalSensorContextProvider {
  String providerId();

  WateringSensorContextDto resolveForPreview(User user, WateringRecommendationPreviewRequest request);

  WateringSensorContextDto resolveForPlant(User user, Plant plant);
}
