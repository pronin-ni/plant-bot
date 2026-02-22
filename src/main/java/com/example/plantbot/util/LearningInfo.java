package com.example.plantbot.util;

public record LearningInfo(double baseIntervalDays,
                           Double avgActualIntervalDays,
                           Double smoothedIntervalDays,
                           double seasonFactor,
                           double weatherFactor,
                           double potFactor,
                           double finalIntervalDays) {
}
