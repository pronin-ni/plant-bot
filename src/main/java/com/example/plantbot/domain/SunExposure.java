package com.example.plantbot.domain;

public enum SunExposure {
  FULL_SUN("Полное солнце"),
  PARTIAL_SHADE("Полутень"),
  SHADE("Тень");

  private final String title;

  SunExposure(String title) {
    this.title = title;
  }

  public String getTitle() {
    return title;
  }
}
