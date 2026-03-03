package com.example.plantbot.controller.dto;

import java.util.List;

public record OpenRouterDiagnoseResponse(
    String problem,
    int confidence,
    String description,
    List<String> causes,
    String treatment,
    String prevention,
    String urgency
) {
}
