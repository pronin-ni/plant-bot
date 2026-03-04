package com.example.plantbot.controller.dto.ha;

import java.time.Instant;

public record PlantConditionPointResponse(Instant sampledAt,
                                          Double temperatureC,
                                          Double humidityPercent,
                                          Double soilMoisturePercent,
                                          Double illuminanceLux) {
}
