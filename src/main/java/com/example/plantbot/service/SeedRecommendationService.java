package com.example.plantbot.service;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.SeedRecommendationPreviewResponse;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.SeedStage;
import com.example.plantbot.domain.SeedWateringMode;
import com.example.plantbot.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SeedRecommendationService {
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;

  public SeedRecommendationPreviewResponse preview(User user, SeedRecommendationPreviewRequest request) {
    SeedStage stage = request.seedStage() == null ? SeedStage.SOWN : request.seedStage();
    PlantEnvironmentType target = request.targetEnvironmentType() == null ? PlantEnvironmentType.INDOOR : request.targetEnvironmentType();

    return openRouterPlantAdvisorService.suggestSeedRecommendation(user, new OpenRouterPlantAdvisorService.SeedRecommendInput(
            request.plantName(),
            stage,
            target,
            request.seedContainerType(),
            request.seedSubstrateType(),
            request.sowingDate(),
            request.germinationTemperatureC(),
            request.underCover(),
            request.growLight(),
            request.region()
        ))
        .map(result -> new SeedRecommendationPreviewResponse(
            result.source(),
            stage,
            target,
            result.careMode(),
            result.recommendedCheckIntervalHours(),
            result.recommendedWateringMode(),
            result.expectedGerminationDaysMin(),
            result.expectedGerminationDaysMax(),
            result.summary(),
            result.reasoning(),
            result.warnings()
        ))
        .orElseGet(() -> fallback(request, stage, target));
  }

  private SeedRecommendationPreviewResponse fallback(SeedRecommendationPreviewRequest request,
                                                     SeedStage stage,
                                                     PlantEnvironmentType target) {
    int elapsedDays = request.sowingDate() == null ? 0 : (int) Math.max(0, ChronoUnit.DAYS.between(request.sowingDate(), LocalDate.now()));
    int minWindow = switch (stage) {
      case SOWN -> 4;
      case GERMINATING -> 2;
      case SPROUTED -> 0;
      case SEEDLING -> 0;
      case READY_TO_TRANSPLANT -> 0;
    };
    int maxWindow = switch (stage) {
      case SOWN -> 12;
      case GERMINATING -> 7;
      case SPROUTED -> 5;
      case SEEDLING -> 10;
      case READY_TO_TRANSPLANT -> 14;
    };
    int recommendedCheckHours = Boolean.TRUE.equals(request.underCover()) ? 12 : 8;
    SeedWateringMode wateringMode = stage == SeedStage.SOWN || stage == SeedStage.GERMINATING
        ? (Boolean.TRUE.equals(request.underCover()) ? SeedWateringMode.VENT_AND_MIST : SeedWateringMode.MIST)
        : SeedWateringMode.LIGHT_SURFACE_WATER;

    List<String> reasoning = new ArrayList<>();
    reasoning.add("Стадия: " + stage.name());
    reasoning.add("Цель после проращивания: " + target.name());
    if (request.germinationTemperatureC() != null) {
      reasoning.add("Температура проращивания: " + Math.round(request.germinationTemperatureC()) + "°C");
    }
    if (elapsedDays > 0) {
      reasoning.add("С посева прошло около " + elapsedDays + " дн.");
    }

    List<String> warnings = new ArrayList<>();
    warnings.add("AI недоступен, использован резервный режим для семян.");
    if (Boolean.TRUE.equals(request.underCover())) {
      warnings.add("При укрытии следите за конденсатом и проветриванием.");
    }

    String summary = switch (stage) {
      case SOWN -> "Поддерживайте стабильную влажность субстрата и проверяйте посев без переувлажнения.";
      case GERMINATING -> "Период прорастания: нужен мягкий контроль влажности и регулярное проветривание.";
      case SPROUTED -> "После появления ростков снижайте риск перелива и постепенно усиливайте свет.";
      case SEEDLING -> "Сеянец уже стабилен: следите за светом и умеренным увлажнением.";
      case READY_TO_TRANSPLANT -> "Растение готовится к переводу в обычную категорию ухода.";
    };

    String careMode = switch (stage) {
      case SOWN, GERMINATING -> "Контроль влажности поверхности и проветривание без тяжёлого полива.";
      case SPROUTED -> "Лёгкое увлажнение и мягкая адаптация к свету.";
      case SEEDLING -> "Регулярный контроль состояния субстрата и освещённости.";
      case READY_TO_TRANSPLANT -> "Подготовка к пересадке и переходу в основной режим ухода.";
    };

    return new SeedRecommendationPreviewResponse(
        "FALLBACK",
        stage,
        target,
        careMode,
        recommendedCheckHours,
        wateringMode,
        minWindow,
        maxWindow,
        summary,
        reasoning,
        warnings
    );
  }
}
