package com.example.plantbot.domain;

public enum PlantType {
  SUCCULENT("Суккулент", 0.10, 0.12),
  TROPICAL("Тропическое", 0.18, 0.20),
  FERN("Папоротник", 0.15, 0.18),
  DEFAULT("Обычное", 0.12, 0.16);

  private final String title;
  private final double minWaterPercent;
  private final double maxWaterPercent;

  PlantType(String title, double minWaterPercent, double maxWaterPercent) {
    this.title = title;
    this.minWaterPercent = minWaterPercent;
    this.maxWaterPercent = maxWaterPercent;
  }

  public String getTitle() {
    return title;
  }

  public double getMinWaterPercent() {
    return minWaterPercent;
  }

  public double getMaxWaterPercent() {
    return maxWaterPercent;
  }
}
