package com.example.plantbot.service;

import com.example.plantbot.controller.dto.PlantAvatarResponse;
import com.example.plantbot.domain.PlantAvatarCacheEntry;
import com.example.plantbot.domain.PlantAvatarSource;
import com.example.plantbot.repository.PlantAvatarCacheEntryRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantAvatarService {
  private final PlantAvatarCacheEntryRepository plantAvatarCacheEntryRepository;
  private final PlantAvatarNameKeyStrategy plantAvatarNameKeyStrategy;
  private final PlantAvatarFallbackFactory plantAvatarFallbackFactory;
  private final PlantAvatarSvgRenderer plantAvatarSvgRenderer;
  private final OpenRouterPlantAvatarService openRouterPlantAvatarService;
  private final ObjectMapper objectMapper;

  private final Map<String, Boolean> inFlightRefreshes = new ConcurrentHashMap<>();

  @Transactional
  public PlantAvatarResponse ensureAvatar(String plantName) {
    String cacheKey = plantAvatarNameKeyStrategy.buildCacheKey(plantName);
    PlantAvatarCacheEntry existing = plantAvatarCacheEntryRepository.findByCacheKey(cacheKey).orElse(null);
    if (existing != null) {
      if (existing.getSource() == PlantAvatarSource.FALLBACK) {
        triggerAsyncAiRefresh(plantName, cacheKey);
      }
      return toResponse(existing);
    }

    PlantAvatarCacheEntry fallbackEntry = saveAvatar(
        plantName,
        cacheKey,
        plantAvatarFallbackFactory.build(plantAvatarNameKeyStrategy.canonicalDisplayName(plantName)),
        PlantAvatarSource.FALLBACK,
        null
    );
    triggerAsyncAiRefresh(plantName, cacheKey);
    return toResponse(fallbackEntry);
  }

  @Transactional
  public PlantAvatarResponse resolveCachedOrFallback(String plantName) {
    String cacheKey = plantAvatarNameKeyStrategy.buildCacheKey(plantName);
    PlantAvatarCacheEntry existing = plantAvatarCacheEntryRepository.findByCacheKey(cacheKey).orElse(null);
    if (existing != null) {
      return toResponse(existing);
    }
    PlantAvatarSpec fallbackSpec = plantAvatarFallbackFactory.build(plantAvatarNameKeyStrategy.canonicalDisplayName(plantName));
    return new PlantAvatarResponse(cacheKey, plantAvatarSvgRenderer.render(plantName, fallbackSpec), PlantAvatarSource.FALLBACK);
  }

  private void triggerAsyncAiRefresh(String plantName, String cacheKey) {
    if (inFlightRefreshes.putIfAbsent(cacheKey, Boolean.TRUE) != null) {
      return;
    }
    CompletableFuture.runAsync(() -> {
      try {
        refreshWithAi(plantName, cacheKey);
      } catch (Exception ex) {
        log.warn("Plant avatar async AI refresh failed for key='{}': {}", cacheKey, ex.getMessage());
      } finally {
        inFlightRefreshes.remove(cacheKey);
      }
    });
  }

  @Transactional
  protected void refreshWithAi(String plantName, String cacheKey) {
    OpenRouterPlantAvatarService.AvatarGenerationResult generated = openRouterPlantAvatarService.generateSpec(
        plantAvatarNameKeyStrategy.canonicalDisplayName(plantName)
    );
    if (!generated.available() || generated.spec() == null) {
      return;
    }
    saveAvatar(plantName, cacheKey, generated.spec(), generated.source(), generated.modelName());
  }

  @Transactional
  protected PlantAvatarCacheEntry saveAvatar(
      String plantName,
      String cacheKey,
      PlantAvatarSpec spec,
      PlantAvatarSource source,
      String modelName
  ) {
    PlantAvatarCacheEntry entry = plantAvatarCacheEntryRepository.findByCacheKey(cacheKey).orElseGet(PlantAvatarCacheEntry::new);
    Instant now = Instant.now();
    entry.setCacheKey(cacheKey);
    entry.setExactName(plantAvatarNameKeyStrategy.canonicalDisplayName(plantName));
    entry.setNormalizedName(plantAvatarNameKeyStrategy.normalizeExactName(plantName));
    entry.setSpecJson(serialize(spec));
    entry.setSvg(plantAvatarSvgRenderer.render(plantName, spec));
    entry.setSource(source == null ? PlantAvatarSource.FALLBACK : source);
    entry.setModelName(modelName == null || modelName.isBlank() ? null : modelName.trim());
    if (entry.getCreatedAt() == null) {
      entry.setCreatedAt(now);
    }
    entry.setUpdatedAt(now);
    entry.setLastAccessedAt(now);
    return plantAvatarCacheEntryRepository.save(entry);
  }

  private PlantAvatarResponse toResponse(PlantAvatarCacheEntry entry) {
    return new PlantAvatarResponse(entry.getCacheKey(), entry.getSvg(), entry.getSource());
  }

  private String serialize(PlantAvatarSpec spec) {
    try {
      return objectMapper.writeValueAsString(spec);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException("Не удалось сериализовать plant avatar spec", ex);
    }
  }
}
