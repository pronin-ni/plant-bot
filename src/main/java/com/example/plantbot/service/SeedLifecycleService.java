package com.example.plantbot.service;

import com.example.plantbot.controller.dto.CreatePlantRequest;
import com.example.plantbot.controller.dto.SeedMigrationApplyRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.RecommendationSource;
import com.example.plantbot.domain.RecommendationSnapshotFlow;
import com.example.plantbot.domain.SeedCareActionType;
import com.example.plantbot.domain.SeedStage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SeedLifecycleService {
  private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
  };

  private final PlantService plantService;
  private final RecommendationSnapshotService recommendationSnapshotService;
  private final AiTextCacheInvalidationService aiTextCacheInvalidationService;
  private final ObjectMapper objectMapper;

  public Plant applySeedCreateFields(Plant plant, CreatePlantRequest request) {
    if (!isSeedPlant(plant, request)) {
      clearSeedFields(plant);
      return plant;
    }
    plant.setSeedStage(request.seedStage() == null ? SeedStage.SOWN : request.seedStage());
    plant.setTargetEnvironmentType(request.targetEnvironmentType());
    plant.setSeedContainerType(request.seedContainerType());
    plant.setSeedSubstrateType(request.seedSubstrateType());
    plant.setSowingDate(request.sowingDate() == null ? LocalDate.now() : request.sowingDate());
    plant.setUnderCover(Boolean.TRUE.equals(request.underCover()));
    plant.setGrowLight(Boolean.TRUE.equals(request.growLight()));
    plant.setGerminationTemperatureC(request.germinationTemperatureC());
    plant.setExpectedGerminationDaysMin(request.expectedGerminationDaysMin());
    plant.setExpectedGerminationDaysMax(request.expectedGerminationDaysMax());
    plant.setRecommendedCheckIntervalHours(request.recommendedCheckIntervalHours());
    plant.setRecommendedWateringMode(request.recommendedWateringMode());
    plant.setSeedCareMode(request.seedCareMode());
    plant.setSeedSummary(request.seedSummary());
    plant.setSeedReasoningJson(request.seedReasoningJson());
    plant.setSeedWarningsJson(request.seedWarningsJson());
    plant.setSeedCareSource(request.seedCareSource());
    if (plant.getSeedActionHistoryJson() == null) {
      plant.setSeedActionHistoryJson(toJson(List.of()));
    }
    return plant;
  }

  private boolean isSeedPlant(Plant plant, CreatePlantRequest request) {
    if (plant != null && plant.getWateringProfile() == PlantEnvironmentType.SEED_START) {
      return true;
    }
    if (plant != null && plant.getCategory() == PlantCategory.SEED_START) {
      return true;
    }
    if (request == null) {
      return false;
    }
    return request.environmentType() == PlantEnvironmentType.SEED_START
        || request.wateringProfile() == PlantEnvironmentType.SEED_START
        || request.category() == PlantCategory.SEED_START;
  }

  private void clearSeedFields(Plant plant) {
    plant.setSeedStage(null);
    plant.setTargetEnvironmentType(null);
    plant.setSeedContainerType(null);
    plant.setSeedSubstrateType(null);
    plant.setSowingDate(null);
    plant.setUnderCover(null);
    plant.setGrowLight(null);
    plant.setGerminationTemperatureC(null);
    plant.setExpectedGerminationDaysMin(null);
    plant.setExpectedGerminationDaysMax(null);
    plant.setRecommendedCheckIntervalHours(null);
    plant.setRecommendedWateringMode(null);
    plant.setSeedCareMode(null);
    plant.setSeedSummary(null);
    plant.setSeedReasoningJson(null);
    plant.setSeedWarningsJson(null);
    plant.setSeedCareSource(null);
    plant.setSeedActionHistoryJson(null);
  }

  public boolean canMigrate(Plant plant) {
    if (plant == null || plant.getWateringProfile() != PlantEnvironmentType.SEED_START) {
      return false;
    }
    SeedStage stage = plant.getSeedStage();
    return stage == SeedStage.SPROUTED || stage == SeedStage.SEEDLING || stage == SeedStage.READY_TO_TRANSPLANT;
  }

  public Plant updateStage(Plant plant, SeedStage nextStage) {
    plant.setSeedStage(nextStage == null ? plant.getSeedStage() : nextStage);
    Plant saved = plantService.save(plant);
    aiTextCacheInvalidationService.invalidateForPlantMutation(saved.getUser(), saved, "seed_stage_update");
    return saved;
  }

  public Plant recordAction(Plant plant, SeedCareActionType action) {
    List<String> actions = readActions(plant);
    String label = switch (action == null ? SeedCareActionType.MOISTEN : action) {
      case MOISTEN -> "Увлажнить";
      case VENT -> "Проветрить";
      case REMOVE_COVER -> "Снять крышку";
      case MOVE_TO_LIGHT -> "Перенести под свет";
      case PRICK_OUT -> "Пикировать";
    };
    actions.add(0, Instant.now() + " | " + label);
    plant.setSeedActionHistoryJson(toJson(actions.stream().limit(20).toList()));
    Plant saved = plantService.save(plant);
    aiTextCacheInvalidationService.invalidateForPlantMutation(saved.getUser(), saved, "seed_action_recorded");
    return saved;
  }

  public List<String> getActions(Plant plant) {
    return readActions(plant);
  }

  public Plant migrate(Plant plant, SeedMigrationApplyRequest request) {
    PlantEnvironmentType target = request.targetEnvironmentType() == null ? plant.getTargetEnvironmentType() : request.targetEnvironmentType();
    if (target == null || target == PlantEnvironmentType.SEED_START) {
      throw new IllegalArgumentException("Target environment type is required for migration");
    }

    plant.setName(request.name() == null || request.name().isBlank() ? plant.getName() : request.name().trim());
    plant.setWateringProfile(target);
    plant.setCategory(categoryByEnvironment(target));
    plant.setPlacement(resolvePlacement(target, request.placement()));
    plant.setType(request.type() == null ? PlantType.DEFAULT : request.type());
    plant.setRegion(request.region());
    plant.setContainerType(request.containerType());
    plant.setContainerVolumeLiters(request.containerVolumeLiters());
    plant.setCropType(target == PlantEnvironmentType.OUTDOOR_GARDEN ? request.cropType() : null);
    plant.setGrowthStage(request.growthStage());
    plant.setGreenhouse(request.greenhouse());
    plant.setDripIrrigation(request.dripIrrigation());
    plant.setOutdoorAreaM2(request.outdoorAreaM2());
    plant.setOutdoorSoilType(request.outdoorSoilType());
    plant.setSunExposure(request.sunExposure());
    plant.setMulched(request.mulched());
    plant.setPerennial(request.perennial());
    plant.setWinterDormancyEnabled(request.winterDormancyEnabled());
    plant.setPotVolumeLiters(request.potVolumeLiters() == null || request.potVolumeLiters() <= 0 ? Math.max(1.0, plant.getPotVolumeLiters()) : request.potVolumeLiters());
    plant.setBaseIntervalDays(request.baseIntervalDays() == null || request.baseIntervalDays() <= 0 ? Math.max(1, plant.getBaseIntervalDays()) : request.baseIntervalDays());
    plant.setPreferredWaterMl(request.preferredWaterMl() == null || request.preferredWaterMl() <= 0 ? plant.getPreferredWaterMl() : request.preferredWaterMl());
    plant.setRecommendationSource(RecommendationSource.MANUAL);
    plant.setRecommendationSummary("Растение переведено из режима проращивания.");
    plant.setGeneratedAt(Instant.now());
    plant.setLastRecommendationSource(RecommendationSource.MANUAL);
    plant.setLastRecommendationSummary("Растение переведено из режима проращивания.");
    plant.setLastRecommendationUpdatedAt(Instant.now());
    plant.setSeedStage(SeedStage.READY_TO_TRANSPLANT);
    Plant saved = plantService.save(plant);
    recommendationSnapshotService.saveManualSnapshot(saved, RecommendationSnapshotFlow.SEED_MIGRATION, RecommendationSource.MANUAL, saved.getBaseIntervalDays(), saved.getPreferredWaterMl(), "Migration from seed mode.");
    aiTextCacheInvalidationService.invalidateForPlantMutation(saved.getUser(), saved, "seed_migration_apply");
    aiTextCacheInvalidationService.invalidateUserDraftFeatures(saved.getUser(), "seed_migration_apply");
    return saved;
  }

  private PlantCategory categoryByEnvironment(PlantEnvironmentType environmentType) {
    return switch (environmentType) {
      case INDOOR -> PlantCategory.HOME;
      case OUTDOOR_ORNAMENTAL -> PlantCategory.OUTDOOR_DECORATIVE;
      case OUTDOOR_GARDEN -> PlantCategory.OUTDOOR_GARDEN;
      case SEED_START -> PlantCategory.SEED_START;
    };
  }

  private PlantPlacement resolvePlacement(PlantEnvironmentType target, PlantPlacement requestedPlacement) {
    if (requestedPlacement != null) {
      return requestedPlacement;
    }
    return target == PlantEnvironmentType.INDOOR ? PlantPlacement.INDOOR : PlantPlacement.OUTDOOR;
  }

  private List<String> readActions(Plant plant) {
    if (plant == null || plant.getSeedActionHistoryJson() == null || plant.getSeedActionHistoryJson().isBlank()) {
      return new ArrayList<>();
    }
    try {
      return new ArrayList<>(objectMapper.readValue(plant.getSeedActionHistoryJson(), STRING_LIST));
    } catch (Exception ex) {
      return new ArrayList<>();
    }
  }

  private String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return "[]";
    }
  }
}
