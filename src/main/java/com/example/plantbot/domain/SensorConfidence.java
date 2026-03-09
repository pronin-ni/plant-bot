package com.example.plantbot.domain;

/**
 * Доверие к sensor-context (для будущего HA/внешних источников).
 */
public enum SensorConfidence {
  NONE,
  LOW,
  MEDIUM,
  HIGH
}
