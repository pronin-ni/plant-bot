package com.example.plantbot.controller.dto;

import java.time.LocalDate;

public record CalendarEventResponse(LocalDate date,
                                    Long plantId,
                                    String plantName) {
}
