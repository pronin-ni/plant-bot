package com.example.plantbot.service.recommendation.mapper;

public record PreviewSensorSelectionContext(
    String haRoomId,
    String haRoomName,
    String temperatureSensorEntityId,
    String humiditySensorEntityId,
    String soilMoistureSensorEntityId,
    String illuminanceSensorEntityId
) {
}
