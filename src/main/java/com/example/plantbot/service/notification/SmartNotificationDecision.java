package com.example.plantbot.service.notification;

import java.time.LocalDate;

public record SmartNotificationDecision(
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
    String rationale
) {
}
