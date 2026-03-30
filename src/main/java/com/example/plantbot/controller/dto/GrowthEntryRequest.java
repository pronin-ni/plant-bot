package com.example.plantbot.controller.dto;

import jakarta.validation.constraints.NotBlank;

public record GrowthEntryRequest(
    @NotBlank(message = "photoBase64 обязателен")
    String photoBase64,
    
    String note,
    
    GrowthEntrySource source
) {
    public enum GrowthEntrySource {
        MANUAL,
        CAMERA,
        AUTO
    }
}
