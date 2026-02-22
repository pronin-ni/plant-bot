package com.example.plantbot.util;

import com.example.plantbot.domain.PlantType;

public record PlantLookupResult(String displayName,
                                int baseIntervalDays,
                                String source,
                                PlantType suggestedType) {
}
