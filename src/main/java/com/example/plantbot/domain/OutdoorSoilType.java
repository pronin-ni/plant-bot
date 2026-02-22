package com.example.plantbot.domain;

public enum OutdoorSoilType {
  SANDY("Песчаный"),
  LOAMY("Суглинистый"),
  CLAY("Глинистый");

  private final String title;

  OutdoorSoilType(String title) {
    this.title = title;
  }

  public String getTitle() {
    return title;
  }
}
