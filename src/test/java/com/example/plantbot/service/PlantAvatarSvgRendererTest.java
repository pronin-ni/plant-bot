package com.example.plantbot.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PlantAvatarSvgRendererTest {
  private final PlantAvatarSvgRenderer renderer = new PlantAvatarSvgRenderer();

  @Test
  void shouldRenderStandaloneSvgMarkup() {
    String svg = renderer.render("Monstera", new PlantAvatarSpec(
        "upright",
        "split",
        "lush",
        "emerald",
        "vein",
        "ceramic",
        "mist"
    ));

    assertTrue(svg.startsWith("<svg"));
    assertTrue(svg.contains("viewBox=\"0 0 128 128\""));
    assertTrue(svg.contains("Plant avatar"));
    assertTrue(svg.contains(">M<"));
  }
}
