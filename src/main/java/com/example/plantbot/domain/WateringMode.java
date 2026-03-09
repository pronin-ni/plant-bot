package com.example.plantbot.domain;

/**
 * Режим применения полива в расписании/рекомендации.
 */
public enum WateringMode {
  STANDARD,
  LIGHT,
  DEEP,
  SOIL_CHECK_FIRST,
  SKIP
}
