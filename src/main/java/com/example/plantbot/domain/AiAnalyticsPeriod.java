package com.example.plantbot.domain;

import java.time.Duration;

public enum AiAnalyticsPeriod {
  HOUR(Duration.ofHours(1)),
  DAY(Duration.ofDays(1)),
  WEEK(Duration.ofDays(7)),
  MONTH(Duration.ofDays(30));

  private final Duration duration;

  AiAnalyticsPeriod(Duration duration) {
    this.duration = duration;
  }

  public Duration duration() {
    return duration;
  }
}
