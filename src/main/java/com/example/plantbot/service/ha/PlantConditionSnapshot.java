package com.example.plantbot.service.ha;

import java.time.Instant;

public record PlantConditionSnapshot(Instant sampledAt,
                                     Double temperatureC,
                                     Double humidityPercent,
                                     Double soilMoisturePercent,
                                     Double illuminanceLux,
                                     String source) {
}
