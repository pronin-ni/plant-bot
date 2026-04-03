package com.example.plantbot.service;

import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class PlantAvatarNameKeyStrategy {
  public String normalizeExactName(String name) {
    if (name == null) {
      return "";
    }
    return name.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
  }

  public String canonicalDisplayName(String name) {
    if (name == null) {
      return "";
    }
    return name.trim().replaceAll("\\s+", " ");
  }

  public String buildCacheKey(String name) {
    return "plant-avatar:v1:" + normalizeExactName(name);
  }
}
