package com.example.plantbot.service.context;

import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringSensorContextDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.SensorConfidence;
import com.example.plantbot.domain.User;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class NoOpSensorContextProvider implements OptionalSensorContextProvider {
  @Override
  public String providerId() {
    return "NONE";
  }

  @Override
  public WateringSensorContextDto resolveForPreview(User user, WateringRecommendationPreviewRequest request) {
    return unavailable();
  }

  @Override
  public WateringSensorContextDto resolveForPlant(User user, Plant plant) {
    return unavailable();
  }

  private WateringSensorContextDto unavailable() {
    return new WateringSensorContextDto(
        false,
        null,
        null,
        null,
        null,
        null,
        null,
        SensorConfidence.NONE,
        "NONE",
        List.of(),
        "Optional sensor context provider is disabled."
    );
  }
}
