package com.example.plantbot.controller.dto.admin;

public record AdminBackupItemResponse(
    String fileName,
    long sizeBytes,
    long modifiedAtEpochMs
) {
}
