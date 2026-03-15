package com.example.plantbot.controller.dto;

import java.util.List;

public record SeedCareActionResponse(boolean ok, Long plantId, List<String> actions) {
}
