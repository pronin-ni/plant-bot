package com.example.plantbot.controller.dto.admin;

import java.util.List;

public record AdminBulkPlantWaterRequest(
    List<Long> plantIds
) {
}
