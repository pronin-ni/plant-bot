package com.example.plantbot.service.notification;

import java.time.LocalDate;

public record SmartNotificationContext(
    Long plantId,
    SmartNotificationType type,
    SmartNotificationPriority priority,
    boolean actionRequired,
    boolean silent,
    boolean recommendationChanged,
    boolean weatherAffected,
    boolean manualMode,
    boolean fallbackMode,
    boolean seedMode,
    LocalDate dueDate,
    Integer previousIntervalDays,
    Integer recommendedIntervalDays,
    Integer previousWaterMl,
    Integer recommendedWaterMl,
    String explainabilitySummary,
    String primaryReason,
    String stageHint,
    String seedActionHint,
    String rationale
) {
}
