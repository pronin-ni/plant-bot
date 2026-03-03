package com.example.plantbot.controller.dto.ha;

import java.time.Instant;

public record PlantConditionsResponse(Long plantId,
                                      String plantName,
                                      Instant sampledAt,
                                      Double temperatureC,
                                      Double humidityPercent,
                                      Double soilMoisturePercent,
                                      Double illuminanceLux,
                                      String illuminanceWarning,
                                      boolean autoAdjustmentEnabled,
                                      boolean adjustedToday,
                                      Double latestAdjustmentPercent,
                                      String source) {
}
