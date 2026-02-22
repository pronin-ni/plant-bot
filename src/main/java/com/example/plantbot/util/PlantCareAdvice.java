package com.example.plantbot.util;

import java.util.List;

public record PlantCareAdvice(int wateringCycleDays,
                              List<String> additives,
                              String note,
                              String source) {
}
