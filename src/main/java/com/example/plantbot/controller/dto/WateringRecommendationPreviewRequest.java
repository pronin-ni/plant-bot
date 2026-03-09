package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.GrowthStage;
import com.example.plantbot.domain.PlantPlacementType;
import com.example.plantbot.domain.PlantContainerType;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.domain.WateringProfileType;

public record WateringRecommendationPreviewRequest(
    String plantName,
    // New S2 contract
    WateringProfileType wateringProfileType,
    PlantPlacementType plantPlacementType,
    Integer manualWaterVolumeMl,
    Boolean weatherAdjustmentEnabled,
    Boolean aiWateringEnabled,
    String region,
    // Backward compatibility
    PlantEnvironmentType environmentType,
    // Indoor
    Double potVolumeLiters,
    Integer baseIntervalDays,
    // Outdoor ornamental
    PlantContainerType containerType,
    Double containerVolume,
    String sunExposure,
    String soilType,
    // Outdoor garden
    String cropType,
    String growthStage,
    GrowthStage growthStageV2,
    Boolean greenhouse,
    SoilType soilTypeV2,
    SunlightExposure sunlightExposure,
    // Optional HA context
    String haRoomId,
    String haRoomName,
    String temperatureSensorEntityId,
    String humiditySensorEntityId,
    String soilMoistureSensorEntityId,
    String illuminanceSensorEntityId,
    // Common
    String city,
    RecommendationMode mode
) {
}
