package com.example.plantbot.controller.dto.admin;

public record AdminBackupRestoreResponse(
    boolean ok,
    String restoredFile,
    String message
) {
}
