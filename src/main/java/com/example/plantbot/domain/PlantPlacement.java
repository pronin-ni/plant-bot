package com.example.plantbot.domain;

public enum PlantPlacement {
  INDOOR("Домашнее"),
  OUTDOOR("Уличное");

  private final String title;

  PlantPlacement(String title) {
    this.title = title;
  }

  public String getTitle() {
    return title;
  }
}
