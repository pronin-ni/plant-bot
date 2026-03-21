package com.example.plantbot.controller.dto.admin;

public record AdminOpenRouterModelsUpdateRequest(
    String textModel,
    String photoModel,
    Integer textModelCheckIntervalMinutes,
    Integer photoModelCheckIntervalMinutes
) {
}
