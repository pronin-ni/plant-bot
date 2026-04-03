package com.example.plantbot.service;

import com.example.plantbot.controller.dto.PlantAvatarResponse;
import com.example.plantbot.domain.PlantAvatarCacheEntry;
import com.example.plantbot.domain.PlantAvatarSource;
import com.example.plantbot.repository.PlantAvatarCacheEntryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlantAvatarServiceTest {
  @Mock
  private PlantAvatarCacheEntryRepository repository;

  @Mock
  private OpenRouterPlantAvatarService openRouterPlantAvatarService;

  private final Map<String, PlantAvatarCacheEntry> store = new ConcurrentHashMap<>();

  private PlantAvatarService plantAvatarService;

  @BeforeEach
  void setUp() {
    lenient().when(repository.findByCacheKey(anyString()))
        .thenAnswer(invocation -> Optional.ofNullable(store.get(invocation.getArgument(0, String.class))));
    lenient().when(repository.save(any(PlantAvatarCacheEntry.class)))
        .thenAnswer(invocation -> {
          PlantAvatarCacheEntry entry = invocation.getArgument(0, PlantAvatarCacheEntry.class);
          store.put(entry.getCacheKey(), entry);
          return entry;
        });
    lenient().when(openRouterPlantAvatarService.generateSpec(anyString()))
        .thenReturn(OpenRouterPlantAvatarService.AvatarGenerationResult.unavailable());

    plantAvatarService = new PlantAvatarService(
        repository,
        new PlantAvatarNameKeyStrategy(),
        new PlantAvatarFallbackFactory(),
        new PlantAvatarSvgRenderer(),
        openRouterPlantAvatarService,
        new ObjectMapper()
    );
  }

  @Test
  void shouldReuseCacheForSameExactNameKey() {
    PlantAvatarResponse first = plantAvatarService.ensureAvatar("  Фикус  ");
    PlantAvatarResponse second = plantAvatarService.ensureAvatar("фикус");
    PlantAvatarResponse third = plantAvatarService.ensureAvatar("Фикус Бенджамина");

    assertEquals(first.cacheKey(), second.cacheKey());
    assertEquals(first.svg(), second.svg());
    assertNotEquals(first.cacheKey(), third.cacheKey());
    assertEquals(PlantAvatarSource.FALLBACK, first.source());
  }

  @Test
  void shouldUpgradeCachedAvatarWhenAiSpecBecomesAvailable() {
    PlantAvatarResponse fallback = plantAvatarService.ensureAvatar("Monstera deliciosa");
    when(openRouterPlantAvatarService.generateSpec("Monstera deliciosa"))
        .thenReturn(new OpenRouterPlantAvatarService.AvatarGenerationResult(
            new PlantAvatarSpec("upright", "split", "lush", "jade", "vein", "ceramic", "mist"),
            PlantAvatarSource.AI,
            "model/test",
            true
        ));

    plantAvatarService.refreshWithAi("Monstera deliciosa", fallback.cacheKey());
    PlantAvatarResponse refreshed = plantAvatarService.resolveCachedOrFallback("Monstera deliciosa");

    assertEquals(fallback.cacheKey(), refreshed.cacheKey());
    assertEquals(PlantAvatarSource.AI, refreshed.source());
    assertNotNull(refreshed.svg());
    assertNotEquals(fallback.svg(), refreshed.svg());
  }
}
