package com.example.plantbot.service;

import org.springframework.stereotype.Component;

@Component
public class PlantAvatarFallbackFactory {
  private static final String[] TEMPLATES = {"rosette", "upright", "trailing", "succulent", "cane"};
  private static final String[] LEAF_SHAPES = {"oval", "lance", "heart", "split", "needle", "paddle"};
  private static final String[] LEAF_DENSITIES = {"sparse", "medium", "lush"};
  private static final String[] PALETTES = {"emerald", "moss", "sage", "jade", "olive", "variegated"};
  private static final String[] ACCENTS = {"none", "bloom", "stripe", "vein"};
  private static final String[] POT_STYLES = {"ceramic", "clay", "glass", "stone"};
  private static final String[] BACKGROUND_TONES = {"mist", "warm", "dusk", "light"};

  public PlantAvatarSpec build(String exactName) {
    int seed = Math.abs(hash(exactName));
    return new PlantAvatarSpec(
        pick(TEMPLATES, seed),
        pick(LEAF_SHAPES, seed / 7),
        pick(LEAF_DENSITIES, seed / 11),
        pick(PALETTES, seed / 13),
        pick(ACCENTS, seed / 17),
        pick(POT_STYLES, seed / 19),
        pick(BACKGROUND_TONES, seed / 23)
    );
  }

  private String pick(String[] values, int seed) {
    return values[Math.floorMod(seed, values.length)];
  }

  private int hash(String value) {
    int hash = 0x811C9DC5;
    String safe = value == null ? "" : value;
    for (int i = 0; i < safe.length(); i += 1) {
      hash ^= safe.charAt(i);
      hash *= 16777619;
    }
    return hash;
  }
}
