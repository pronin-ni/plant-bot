package com.example.plantbot.controller.dto;

public record CalendarSyncResponse(boolean enabled,
                                   String webcalUrl,
                                   String httpsUrl) {
}
