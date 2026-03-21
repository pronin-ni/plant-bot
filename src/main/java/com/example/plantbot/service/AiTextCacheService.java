package com.example.plantbot.service;

import com.example.plantbot.domain.AiTextCacheEntry;
import com.example.plantbot.domain.AiTextFeatureType;
import com.example.plantbot.repository.AiTextCacheEntryRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiTextCacheService {
  private static final int SCHEMA_VERSION = 1;

  private final AiTextCacheEntryRepository aiTextCacheEntryRepository;
  private final AiTextCacheKeyFactory aiTextCacheKeyFactory;
  private final OpenRouterGlobalSettingsService openRouterGlobalSettingsService;
  private final ObjectMapper objectMapper;

  @Transactional
  public <T> CacheLookupResult<T> find(
      Long userId,
      Long plantId,
      AiTextFeatureType featureType,
      String modelName,
      Map<String, ?> rawInput,
      Class<T> payloadType
  ) {
    String inputHash = aiTextCacheKeyFactory.hashNormalizedInput(rawInput);
    String cacheKey = aiTextCacheKeyFactory.buildCacheKey(
        userId,
        plantId,
        featureType,
        modelName,
        inputHash,
        SCHEMA_VERSION
    );
    return findByResolvedKey(cacheKey, inputHash, payloadType);
  }

  @Transactional
  public <T> CacheLookupResult<T> find(
      Long userId,
      Long plantId,
      AiTextFeatureType featureType,
      String modelName,
      Map<String, ?> rawInput,
      TypeReference<T> payloadType
  ) {
    String inputHash = aiTextCacheKeyFactory.hashNormalizedInput(rawInput);
    String cacheKey = aiTextCacheKeyFactory.buildCacheKey(
        userId,
        plantId,
        featureType,
        modelName,
        inputHash,
        SCHEMA_VERSION
    );
    return findByResolvedKey(cacheKey, inputHash, payloadType);
  }

  @Transactional
  public <T> CacheWriteResult put(
      Long userId,
      Long plantId,
      AiTextFeatureType featureType,
      String modelName,
      Map<String, ?> rawInput,
      T payload
  ) {
    if (payload == null) {
      throw new IllegalArgumentException("AI cache payload must not be null");
    }

    String inputHash = aiTextCacheKeyFactory.hashNormalizedInput(rawInput);
    String cacheKey = aiTextCacheKeyFactory.buildCacheKey(
        userId,
        plantId,
        featureType,
        modelName,
        inputHash,
        SCHEMA_VERSION
    );

    if (!isEnabled()) {
      return new CacheWriteResult(null, cacheKey, inputHash, null);
    }

    AiTextCacheEntry entry = aiTextCacheEntryRepository.findByCacheKeyAndInvalidatedAtIsNull(cacheKey)
        .orElseGet(AiTextCacheEntry::new);

    Instant now = Instant.now();
    entry.setCacheKey(cacheKey);
    entry.setUserId(userId);
    entry.setPlantId(plantId);
    entry.setFeatureType(featureType);
    entry.setInputHash(inputHash);
    entry.setModelName(normalizeModelName(modelName));
    entry.setResponsePayload(serializePayload(payload));
    if (entry.getCreatedAt() == null) {
      entry.setCreatedAt(now);
    }
    entry.setExpiresAt(now.plus(resolveConfiguredTtlDays(), ChronoUnit.DAYS));
    entry.setLastAccessedAt(now);
    entry.setHitCount(Math.max(0L, entry.getHitCount()));
    entry.setInvalidatedAt(null);
    entry.setSchemaVersion(SCHEMA_VERSION);

    AiTextCacheEntry saved = aiTextCacheEntryRepository.save(entry);
    return new CacheWriteResult(saved.getId(), cacheKey, inputHash, saved.getExpiresAt());
  }

  @Transactional
  public int cleanupExpiredOrInvalidated() {
    return aiTextCacheEntryRepository.deleteExpiredOrInvalidated(Instant.now());
  }

  @Transactional
  public int clearAll() {
    long count = aiTextCacheEntryRepository.countByInvalidatedAtIsNull();
    aiTextCacheEntryRepository.deleteAllInBatch();
    return (int) Math.min(Integer.MAX_VALUE, count);
  }

  public long countActiveEntries() {
    return aiTextCacheEntryRepository.countByInvalidatedAtIsNull();
  }

  public boolean isEnabled() {
    return openRouterGlobalSettingsService.isAiTextCacheEnabled();
  }

  public int resolveTtlDays() {
    return openRouterGlobalSettingsService.resolveAiTextCacheTtlDays();
  }

  private <T> CacheLookupResult<T> findByResolvedKey(String cacheKey, String inputHash, Class<T> payloadType) {
    if (!isEnabled()) {
      return CacheLookupResult.disabled(cacheKey, inputHash);
    }

    Optional<AiTextCacheEntry> optionalEntry = aiTextCacheEntryRepository.findByCacheKeyAndInvalidatedAtIsNull(cacheKey);
    if (optionalEntry.isEmpty()) {
      return CacheLookupResult.miss(cacheKey, inputHash);
    }

    AiTextCacheEntry entry = optionalEntry.get();
    if (isExpired(entry)) {
      aiTextCacheEntryRepository.delete(entry);
      return CacheLookupResult.expired(cacheKey, inputHash);
    }

    try {
      T payload = objectMapper.readValue(entry.getResponsePayload(), payloadType);
      touchEntry(entry);
      return CacheLookupResult.hit(cacheKey, inputHash, payload, entry.getExpiresAt());
    } catch (Exception ex) {
      log.warn("AI text cache payload parse failed. cacheKey={}, featureType={}, error={}",
          cacheKey,
          entry.getFeatureType(),
          ex.getMessage());
      aiTextCacheEntryRepository.delete(entry);
      return CacheLookupResult.corrupted(cacheKey, inputHash);
    }
  }

  private <T> CacheLookupResult<T> findByResolvedKey(String cacheKey, String inputHash, TypeReference<T> payloadType) {
    if (!isEnabled()) {
      return CacheLookupResult.disabled(cacheKey, inputHash);
    }

    Optional<AiTextCacheEntry> optionalEntry = aiTextCacheEntryRepository.findByCacheKeyAndInvalidatedAtIsNull(cacheKey);
    if (optionalEntry.isEmpty()) {
      return CacheLookupResult.miss(cacheKey, inputHash);
    }

    AiTextCacheEntry entry = optionalEntry.get();
    if (isExpired(entry)) {
      aiTextCacheEntryRepository.delete(entry);
      return CacheLookupResult.expired(cacheKey, inputHash);
    }

    try {
      T payload = objectMapper.readValue(entry.getResponsePayload(), payloadType);
      touchEntry(entry);
      return CacheLookupResult.hit(cacheKey, inputHash, payload, entry.getExpiresAt());
    } catch (Exception ex) {
      log.warn("AI text cache payload parse failed. cacheKey={}, featureType={}, error={}",
          cacheKey,
          entry.getFeatureType(),
          ex.getMessage());
      aiTextCacheEntryRepository.delete(entry);
      return CacheLookupResult.corrupted(cacheKey, inputHash);
    }
  }

  private boolean isExpired(AiTextCacheEntry entry) {
    return entry.getExpiresAt() == null || entry.getExpiresAt().isBefore(Instant.now());
  }

  private void touchEntry(AiTextCacheEntry entry) {
    entry.setLastAccessedAt(Instant.now());
    entry.setHitCount(entry.getHitCount() + 1);
    aiTextCacheEntryRepository.save(entry);
  }

  private String serializePayload(Object payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Не удалось сериализовать AI text cache payload", ex);
    }
  }

  private String normalizeModelName(String modelName) {
    if (modelName == null || modelName.isBlank()) {
      return "model:unknown";
    }
    return modelName.trim();
  }

  private int resolveConfiguredTtlDays() {
    return openRouterGlobalSettingsService.resolveAiTextCacheTtlDays();
  }

  public record CacheLookupResult<T>(
      CacheStatus status,
      String cacheKey,
      String inputHash,
      T payload,
      Instant expiresAt
  ) {
    static <T> CacheLookupResult<T> disabled(String cacheKey, String inputHash) {
      return new CacheLookupResult<>(CacheStatus.DISABLED, cacheKey, inputHash, null, null);
    }

    static <T> CacheLookupResult<T> miss(String cacheKey, String inputHash) {
      return new CacheLookupResult<>(CacheStatus.MISS, cacheKey, inputHash, null, null);
    }

    static <T> CacheLookupResult<T> expired(String cacheKey, String inputHash) {
      return new CacheLookupResult<>(CacheStatus.EXPIRED, cacheKey, inputHash, null, null);
    }

    static <T> CacheLookupResult<T> corrupted(String cacheKey, String inputHash) {
      return new CacheLookupResult<>(CacheStatus.CORRUPTED, cacheKey, inputHash, null, null);
    }

    static <T> CacheLookupResult<T> hit(String cacheKey, String inputHash, T payload, Instant expiresAt) {
      return new CacheLookupResult<>(CacheStatus.HIT, cacheKey, inputHash, payload, expiresAt);
    }

    public boolean hit() {
      return status == CacheStatus.HIT && payload != null;
    }
  }

  public record CacheWriteResult(
      Long entryId,
      String cacheKey,
      String inputHash,
      Instant expiresAt
  ) {
  }

  public enum CacheStatus {
    HIT,
    MISS,
    EXPIRED,
    CORRUPTED,
    DISABLED
  }
}
