package com.example.plantbot.service.ha;

public record IntervalAdjustmentResult(double intervalDays,
                                       boolean applied,
                                       double deltaPercent,
                                       String reason,
                                       String source) {
}
