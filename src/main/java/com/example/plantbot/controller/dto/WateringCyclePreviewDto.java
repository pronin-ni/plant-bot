package com.example.plantbot.controller.dto;

import java.time.LocalDate;
import java.util.List;

public record WateringCyclePreviewDto(
    List<LocalDate> dates
) {
}
