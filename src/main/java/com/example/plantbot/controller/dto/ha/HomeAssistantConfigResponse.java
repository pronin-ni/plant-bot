package com.example.plantbot.controller.dto.ha;

public record HomeAssistantConfigResponse(boolean connected, String message, String instanceName) {
}
