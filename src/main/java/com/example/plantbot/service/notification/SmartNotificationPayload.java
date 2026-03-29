package com.example.plantbot.service.notification;

public record SmartNotificationPayload(
    String title,
    String body,
    String tag,
    String openTargetUrl,
    boolean requireInteraction,
    boolean renotify
) {
}
