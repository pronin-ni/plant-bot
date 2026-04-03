package com.example.plantbot.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlantAvatarNameKeyStrategyTest {
  private final PlantAvatarNameKeyStrategy strategy = new PlantAvatarNameKeyStrategy();

  @Test
  void shouldNormalizeTrimmedLowercaseExactName() {
    assertEquals("фикус", strategy.normalizeExactName("  Фикус  "));
    assertEquals("фикус бенджамина", strategy.normalizeExactName("Фикус   Бенджамина"));
  }

  @Test
  void shouldKeepDifferentFullNamesSeparated() {
    String first = strategy.buildCacheKey("Фикус");
    String second = strategy.buildCacheKey("Фикус Бенджамина");

    assertEquals("plant-avatar:v1:фикус", first);
    assertEquals("plant-avatar:v1:фикус бенджамина", second);
  }
}
