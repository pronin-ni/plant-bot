package com.example.plantbot.service;

import com.example.plantbot.domain.AiTextFeatureType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.AiTextCacheEntryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiTextCacheInvalidationService {
  private static final Set<AiTextFeatureType> PLANT_SCOPED_FEATURES = EnumSet.of(
      AiTextFeatureType.PLANT_CARE_ADVICE,
      AiTextFeatureType.PLANT_WATERING_PROFILE_AI,
      AiTextFeatureType.PLANT_DIAGNOSIS_TEXT,
      AiTextFeatureType.PLANT_IDENTIFY_TEXT,
      AiTextFeatureType.SEED_RECOMMENDATION
  );

  private static final Set<AiTextFeatureType> USER_DRAFT_FEATURES = EnumSet.of(
      AiTextFeatureType.WIZARD_WATERING_RECOMMENDATION,
      AiTextFeatureType.PLANT_AI_RECOMMEND_LEGACY,
      AiTextFeatureType.PLANT_SEARCH_SUGGESTIONS_AI,
      AiTextFeatureType.SEED_RECOMMENDATION,
      AiTextFeatureType.PLANT_IDENTIFY_TEXT,
      AiTextFeatureType.PLANT_DIAGNOSIS_TEXT
  );

  private final AiTextCacheEntryRepository aiTextCacheEntryRepository;

  @Transactional
  public int invalidatePlantScoped(User user, Plant plant, String reason) {
    if (user == null || user.getId() == null || plant == null || plant.getId() == null) {
      return 0;
    }
    int invalidated = aiTextCacheEntryRepository.invalidatePlantScoped(user.getId(), plant.getId(), Instant.now());
    log.debug("AI text cache invalidated (plant scoped): userId={}, plantId={}, reason={}, count={}",
        user.getId(), plant.getId(), reason, invalidated);
    return invalidated;
  }

  @Transactional
  public int invalidatePlantFeatures(User user, Plant plant, Set<AiTextFeatureType> featureTypes, String reason) {
    if (user == null || user.getId() == null || plant == null || plant.getId() == null || featureTypes == null || featureTypes.isEmpty()) {
      return 0;
    }
    int invalidated = aiTextCacheEntryRepository.invalidatePlantFeatures(user.getId(), plant.getId(), featureTypes, Instant.now());
    log.debug("AI text cache invalidated (feature scoped): userId={}, plantId={}, reason={}, features={}, count={}",
        user.getId(), plant.getId(), reason, featureTypes, invalidated);
    return invalidated;
  }

  @Transactional
  public int invalidateUserDraftFeatures(User user, String reason) {
    if (user == null || user.getId() == null) {
      return 0;
    }
    int invalidated = aiTextCacheEntryRepository.invalidateUserDraftFeatures(user.getId(), USER_DRAFT_FEATURES, Instant.now());
    log.debug("AI text cache invalidated (draft/user scoped): userId={}, reason={}, count={}",
        user.getId(), reason, invalidated);
    return invalidated;
  }

  @Transactional
  public int invalidateForPlantMutation(User user, Plant plant, String reason) {
    return invalidatePlantFeatures(user, plant, PLANT_SCOPED_FEATURES, reason);
  }

  @Transactional
  public int invalidateForLocationMutation(User user, String reason) {
    if (user == null || user.getId() == null) {
      return 0;
    }
    int invalidatedDraft = aiTextCacheEntryRepository.invalidateUserDraftFeatures(user.getId(), USER_DRAFT_FEATURES, Instant.now());
    log.debug("AI text cache invalidated (location scoped): userId={}, reason={}, draftCount={}",
        user.getId(), reason, invalidatedDraft);
    return invalidatedDraft;
  }
}
