package com.example.plantbot.service.notification;

import com.example.plantbot.domain.Plant;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;

@Service
public class SmartNotificationFormatter {
  private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("dd.MM");

  public SmartNotificationPayload format(Plant plant, SmartNotificationContext context) {
    String title = buildTitle(context);
    String body = buildBody(plant, context);
    String tag = buildTag(plant, context);
    String openTargetUrl = buildOpenTargetUrl(plant);
    boolean requireInteraction = context.priority() == SmartNotificationPriority.HIGH && !context.silent();
    boolean renotify = context.priority() == SmartNotificationPriority.HIGH || context.recommendationChanged();
    return new SmartNotificationPayload(title, body, tag, openTargetUrl, requireInteraction, renotify);
  }

  private String buildTitle(SmartNotificationContext context) {
    return switch (context.type()) {
      case WATER_NOW -> "Сегодня лучше полить растение";
      case WATER_SOON -> "Скоро понадобится полив";
      case CAN_DELAY_WATERING -> "Полив можно немного отложить";
      case RECOMMENDATION_CHANGED -> "Режим полива изменился";
      case WEATHER_ALERT -> "Погода повлияла на режим";
      case SEED_ACTION_DUE -> seedActionTitle(context);
      case MANUAL_MODE_NOTICE -> "Режим зафиксирован вручную";
      case FALLBACK_MODE_NOTICE -> "Использован резервный расчёт";
      case STAGE_CHANGE_NOTICE -> "Стадия изменилась";
    };
  }

  private String buildBody(Plant plant, SmartNotificationContext context) {
    if (context.seedMode()) {
      String stage = humanizeStage(context.stageHint());
      if (stage != null) {
        return context.primaryReason() + " Стадия сейчас: " + stage + ".";
      }
      return context.primaryReason();
    }

    String plantName = plant == null || plant.getName() == null || plant.getName().isBlank()
        ? "Растение"
        : plant.getName().trim();
    String duePart = context.dueDate() == null ? null : "Ориентир по режиму — до " + DATE_FORMAT.format(context.dueDate()) + ".";
    String amountPart = context.recommendedWaterMl() == null ? null : "Сейчас ориентир — " + context.recommendedWaterMl() + " мл.";

    return switch (context.type()) {
      case WATER_NOW -> joinSentences(
          plantName + " уже пора проверить и, скорее всего, полить.",
          context.primaryReason(),
          amountPart
      );
      case WATER_SOON -> joinSentences(
          plantName + " скоро потребует внимания.",
          context.primaryReason(),
          duePart
      );
      case CAN_DELAY_WATERING -> joinSentences(
          plantName + " можно пока не поливать.",
          context.primaryReason(),
          duePart
      );
      case RECOMMENDATION_CHANGED -> joinSentences(
          "Для " + plantName + " режим ухода заметно изменился.",
          context.primaryReason(),
          buildChangeHint(context)
      );
      case WEATHER_ALERT -> joinSentences(
          "Погода изменила уход за " + plantName + ".",
          duePart,
          buildChangeHint(context)
      );
      case MANUAL_MODE_NOTICE -> joinSentences(
          "Для " + plantName + " сейчас действует ручной режим.",
          amountPart
      );
      case FALLBACK_MODE_NOTICE -> joinSentences(
          "Для " + plantName + " сейчас используется резервный совет.",
          duePart
      );
      case STAGE_CHANGE_NOTICE -> joinSentences(
          "У растения изменилась стадия.",
          context.primaryReason(),
          stageSentence(context),
          seedActionSentence(context)
      );
      case SEED_ACTION_DUE -> joinSentences(
          seedActionLead(context),
          context.primaryReason(),
          stageSentence(context),
          seedActionSentence(context)
      );
    };
  }

  private String seedActionTitle(SmartNotificationContext context) {
    String action = context.seedActionHint();
    if (action == null || action.isBlank()) {
      return "Пора проверить рассаду";
    }
    return switch (action) {
      case "проветрить" -> "Пора проветрить рассаду";
      case "снять крышку" -> "Пора снять крышку";
      case "перенести под свет" -> "Пора перенести рассаду под свет";
      case "пора готовить к пересадке" -> "Пора готовить рассаду к пересадке";
      default -> "Пора проверить рассаду";
    };
  }

  private String seedActionLead(SmartNotificationContext context) {
    String action = context.seedActionHint();
    if (action == null || action.isBlank()) {
      return "Пора проверить рассаду.";
    }
    return switch (action) {
      case "проветрить" -> "Пора проветрить рассаду.";
      case "снять крышку" -> "Пора снять крышку и дать росткам больше воздуха.";
      case "перенести под свет" -> "Пора перенести рассаду под свет.";
      case "пора готовить к пересадке" -> "Рассаду пора готовить к пересадке.";
      default -> "Пора проверить рассаду.";
    };
  }

  private String seedActionSentence(SmartNotificationContext context) {
    String action = context.seedActionHint();
    if (action == null || action.isBlank()) {
      return null;
    }
    return switch (action) {
      case "проветрить" -> "Лучше коротко проветрить контейнер и проверить влажность.";
      case "снять крышку" -> "Росткам уже нужен более открытый режим без лишней влажности под крышкой.";
      case "перенести под свет" -> "Свет поможет росткам расти ровнее и не вытягиваться.";
      case "пора готовить к пересадке" -> "Следующий шаг — подготовить более просторное место для роста.";
      default -> null;
    };
  }

  private String buildOpenTargetUrl(Plant plant) {
    if (plant == null || plant.getId() == null) {
      return "/pwa/";
    }
    return "/pwa/?tab=home&plantId=" + plant.getId();
  }

  private String buildTag(Plant plant, SmartNotificationContext context) {
    Long plantId = plant == null ? null : plant.getId();
    String scope = plantId == null ? "general" : "plant-" + plantId;
    return "smart-" + context.type().name().toLowerCase() + "-" + scope;
  }

  private String buildChangeHint(SmartNotificationContext context) {
    if (context.previousIntervalDays() != null && context.recommendedIntervalDays() != null
        && !context.previousIntervalDays().equals(context.recommendedIntervalDays())) {
      return "Интервал: " + context.previousIntervalDays() + " → " + context.recommendedIntervalDays() + " дн.";
    }
    if (context.previousWaterMl() != null && context.recommendedWaterMl() != null
        && !context.previousWaterMl().equals(context.recommendedWaterMl())) {
      return "Объём: " + context.previousWaterMl() + " → " + context.recommendedWaterMl() + " мл.";
    }
    return null;
  }

  private String stageSentence(SmartNotificationContext context) {
    String stage = humanizeStage(context.stageHint());
    return stage == null ? null : "Текущая стадия: " + stage + ".";
  }

  private String humanizeStage(String stageHint) {
    if (stageHint == null || stageHint.isBlank()) {
      return null;
    }
    return switch (stageHint.trim().toUpperCase()) {
      case "SOWN" -> "посев";
      case "GERMINATING" -> "прорастание";
      case "SPROUTED" -> "появились всходы";
      case "SEEDLING" -> "сеянец";
      case "READY_TO_TRANSPLANT" -> "готово к пересадке";
      case "VEGETATIVE", "FLOWERING", "FRUITING", "HARVEST" -> stageHint.toLowerCase();
      default -> stageHint.toLowerCase();
    };
  }

  private String joinSentences(String... parts) {
    StringBuilder result = new StringBuilder();
    for (String part : parts) {
      if (part == null || part.isBlank()) {
        continue;
      }
      String normalized = part.trim();
      if (result.length() > 0) {
        result.append(' ');
      }
      result.append(normalized);
      char last = normalized.charAt(normalized.length() - 1);
      if (last != '.' && last != '!' && last != '?') {
        result.append('.');
      }
    }
    return result.toString().trim();
  }
}
