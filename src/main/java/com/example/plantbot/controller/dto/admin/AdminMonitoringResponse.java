package com.example.plantbot.controller.dto.admin;

public record AdminMonitoringResponse(
    long onlineUsers,
    long activeUsers24h,
    double avgSessionMinutes,
    long errorsToday,
    long pushFailuresToday
) {
}
