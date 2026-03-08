package com.example.plantbot.service;

import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class PlantNameNormalizer {
  public String normalize(String value) {
    if (value == null) {
      return "";
    }
    String normalized = value
        .trim()
        .toLowerCase(Locale.ROOT)
        .replace('ё', 'е')
        .replaceAll("[^\\p{L}\\p{N}\\s-]+", " ")
        .replaceAll("\\s+", " ");
    return normalized;
  }
}

