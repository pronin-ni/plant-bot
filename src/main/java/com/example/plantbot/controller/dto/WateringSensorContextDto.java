package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.SensorConfidence;

import java.util.List;

public record WateringSensorContextDto(
    boolean available,
    String roomId,
    String roomName,
    Double temperatureC,
    Double humidityPercent,
    Double soilMoisturePercent,
    Double illuminanceLux,
    SensorConfidence confidence,
    String source,
    List<String> sensorEntityIds,
    String message
) {
}
