package com.example.plantbot.controller.dto.ha;

public record PlantRoomBindingRequest(String areaId,
                                      String areaName,
                                      String selectionMode,
                                      String temperatureEntityId,
                                      String humidityEntityId,
                                      String soilMoistureEntityId,
                                      String illuminanceEntityId,
                                      Boolean autoAdjustmentEnabled,
                                      Double maxAdjustmentFraction) {
}
