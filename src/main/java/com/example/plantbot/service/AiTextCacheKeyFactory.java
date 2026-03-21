package com.example.plantbot.service;

import com.example.plantbot.domain.AiTextFeatureType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

@Component
@RequiredArgsConstructor
public class AiTextCacheKeyFactory {
  private final ObjectMapper objectMapper;

  public String buildCacheKey(
      Long userId,
      Long plantId,
      AiTextFeatureType featureType,
      String modelName,
      String inputHash,
      int schemaVersion
  ) {
    String safeModel = normalize(modelName, "model:unknown");
    String safeHash = normalize(inputHash, "input:missing");
    String safePlant = plantId == null ? "plant:draft" : "plant:" + plantId;
    return "ai-text-cache|"
        + "v" + schemaVersion + "|"
        + "user:" + userId + "|"
        + safePlant + "|"
        + "feature:" + featureType.name() + "|"
        + "model:" + safeModel + "|"
        + "hash:" + safeHash;
  }

  public String hashNormalizedInput(Map<String, ?> rawInput) {
    Map<String, Object> normalized = new TreeMap<>();
    if (rawInput != null) {
      rawInput.forEach((key, value) -> {
        if (key != null && !key.isBlank()) {
          normalized.put(key, normalizeValue(value));
        }
      });
    }
    return sha256(toCanonicalJson(normalized));
  }

  public String hashNormalizedInput(String featureName, Map<String, ?> rawInput) {
    Map<String, Object> envelope = new LinkedHashMap<>();
    envelope.put("feature", normalize(featureName, "unknown"));
    envelope.put("input", rawInput == null ? Map.of() : new TreeMap<>(rawInput));
    return hashNormalizedInput(envelope);
  }

  private Object normalizeValue(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof String stringValue) {
      return stringValue.trim();
    }
    if (value instanceof Enum<?> enumValue) {
      return enumValue.name();
    }
    if (value instanceof Map<?, ?> mapValue) {
      Map<String, Object> normalized = new TreeMap<>();
      mapValue.forEach((key, nestedValue) -> {
        if (key != null) {
          normalized.put(String.valueOf(key), normalizeValue(nestedValue));
        }
      });
      return normalized;
    }
    if (value instanceof Iterable<?> iterableValue) {
      java.util.List<Object> normalized = new java.util.ArrayList<>();
      iterableValue.forEach(item -> normalized.add(normalizeValue(item)));
      return normalized;
    }
    return value;
  }

  private String toCanonicalJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Не удалось сериализовать входные данные AI-кэша", ex);
    }
  }

  private String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(hash.length * 2);
      for (byte b : hash) {
        sb.append(String.format("%02x", b));
      }
      return sb.toString();
    } catch (Exception ex) {
      throw new IllegalStateException("Не удалось посчитать hash для AI-кэша", ex);
    }
  }

  private String normalize(String value, String fallback) {
    if (value == null) {
      return fallback;
    }
    String trimmed = value.trim().toLowerCase();
    return trimmed.isEmpty() ? fallback : trimmed;
  }
}
