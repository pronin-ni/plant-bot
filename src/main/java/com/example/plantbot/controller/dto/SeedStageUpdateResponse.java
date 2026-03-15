package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.SeedStage;

public record SeedStageUpdateResponse(boolean ok, Long plantId, SeedStage seedStage) {
}
