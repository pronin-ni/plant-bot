package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.PlantResponse;
import com.example.plantbot.controller.dto.SeedCareActionRequest;
import com.example.plantbot.controller.dto.SeedCareActionResponse;
import com.example.plantbot.controller.dto.SeedMigrationApplyRequest;
import com.example.plantbot.controller.dto.SeedMigrationApplyResponse;
import com.example.plantbot.controller.dto.SeedMigrationPreviewResponse;
import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.SeedRecommendationPreviewResponse;
import com.example.plantbot.controller.dto.SeedStageUpdateRequest;
import com.example.plantbot.controller.dto.SeedStageUpdateResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedCareActionType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.SeedLifecycleService;
import com.example.plantbot.service.SeedRecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/seeds")
@RequiredArgsConstructor
public class SeedController {
  private final CurrentUserService currentUserService;
  private final PlantService plantService;
  private final SeedRecommendationService seedRecommendationService;
  private final SeedLifecycleService seedLifecycleService;

  @PostMapping("/recommendation/preview")
  public SeedRecommendationPreviewResponse preview(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody SeedRecommendationPreviewRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.plantName() == null || request.plantName().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plantName обязателен");
    }
    if (request.targetEnvironmentType() == null || request.targetEnvironmentType() == PlantEnvironmentType.SEED_START) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "targetEnvironmentType обязателен и не может указывать на режим проращивания");
    }
    return seedRecommendationService.preview(user, request);
  }

  @PostMapping("/{plantId}/stage")
  public SeedStageUpdateResponse updateStage(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable Long plantId,
      @RequestBody SeedStageUpdateRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedSeed(user, plantId);
    SeedStage nextStage = request == null || request.seedStage() == null ? plant.getSeedStage() : request.seedStage();
    seedLifecycleService.updateStage(plant, nextStage);
    return new SeedStageUpdateResponse(true, plant.getId(), nextStage);
  }

  @PostMapping("/{plantId}/actions")
  public SeedCareActionResponse recordAction(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable Long plantId,
      @RequestBody SeedCareActionRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedSeed(user, plantId);
    SeedCareActionType action = request == null || request.action() == null ? SeedCareActionType.MOISTEN : request.action();
    Plant saved = seedLifecycleService.recordAction(plant, action);
    return new SeedCareActionResponse(true, saved.getId(), seedLifecycleService.getActions(saved));
  }

  @PostMapping("/{plantId}/migration/preview")
  public SeedMigrationPreviewResponse previewMigration(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedSeed(user, plantId);
    boolean allowed = seedLifecycleService.canMigrate(plant);
    PlantEnvironmentType target = plant.getTargetEnvironmentType();
    return new SeedMigrationPreviewResponse(
        allowed,
        plant.getId(),
        plant.getSeedStage(),
        target,
        targetLabel(target),
        plant.getName(),
        allowed ? "Можно перевести в обычное растение." : "Сначала доведите посев до подходящей стадии."
    );
  }

  @PostMapping("/{plantId}/migrate")
  public SeedMigrationApplyResponse migrate(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable Long plantId,
      @RequestBody SeedMigrationApplyRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedSeed(user, plantId);
    if (!seedLifecycleService.canMigrate(plant)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Растение ещё не готово к переводу");
    }
    Plant saved = seedLifecycleService.migrate(plant, request);
    return new SeedMigrationApplyResponse(true, saved.getId(), saved.getCategory(), saved.getWateringProfile());
  }

  private Plant requireOwnedSeed(User user, Long plantId) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (plant.getUser() == null || !plant.getUser().getId().equals(user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
    }
    if (plant.getCategory() != PlantCategory.SEED_START || plant.getWateringProfile() != PlantEnvironmentType.SEED_START) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Это растение не находится в режиме проращивания");
    }
    return plant;
  }

  private String targetLabel(PlantEnvironmentType target) {
    if (target == null) {
      return "Не выбрана";
    }
    return switch (target) {
      case INDOOR -> "Домашнее растение";
      case OUTDOOR_ORNAMENTAL -> "Уличное декоративное";
      case OUTDOOR_GARDEN -> "Уличное садовое";
      case SEED_START -> "Проращивание семян";
    };
  }
}
