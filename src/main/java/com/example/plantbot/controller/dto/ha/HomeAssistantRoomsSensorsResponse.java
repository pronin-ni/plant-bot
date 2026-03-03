package com.example.plantbot.controller.dto.ha;

import java.util.List;

public record HomeAssistantRoomsSensorsResponse(boolean connected,
                                                List<HaRoomDto> rooms,
                                                List<HaSensorDto> sensors,
                                                String message) {
}
