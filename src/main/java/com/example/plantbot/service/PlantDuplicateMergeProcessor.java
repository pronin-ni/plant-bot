package com.example.plantbot.service;

import com.example.plantbot.domain.DictionaryMergeStatus;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantDictionaryAlias;
import com.example.plantbot.domain.PlantDictionaryEntry;
import com.example.plantbot.domain.PlantDuplicateMergeTask;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantDictionaryAliasRepository;
import com.example.plantbot.repository.PlantDictionaryEntryRepository;
import com.example.plantbot.repository.PlantDuplicateMergeTaskRepository;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantDuplicateMergeProcessor {
  private final PlantDuplicateMergeTaskRepository mergeTaskRepository;
  private final PlantDictionaryEntryRepository entryRepository;
  private final PlantDictionaryAliasRepository aliasRepository;
  private final PlantNameNormalizer plantNameNormalizer;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;
  private final UserRepository userRepository;
  private final AdminNotificationService adminNotificationService;

  @Value("${app.dictionary.merge-batch-size:20}")
  private int mergeBatchSize;

  @Value("${app.dictionary.merge-max-attempts:30}")
  private int mergeMaxAttempts;

  @Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @Scheduled(cron = "${app.dictionary.merge-cron:0 35 4 * * *}")
  @Transactional
  public void processMergeQueue() {
    List<PlantDuplicateMergeTask> due = mergeTaskRepository
        .findByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(
            Set.of(DictionaryMergeStatus.PENDING, DictionaryMergeStatus.RETRY_SCHEDULED),
            Instant.now(),
            PageRequest.of(0, Math.max(1, mergeBatchSize))
        );
    if (due.isEmpty()) {
      return;
    }

    User contextUser = resolveAdminUser();
    int merged = 0;
    int postponed = 0;
    int manual = 0;

    for (PlantDuplicateMergeTask task : due) {
      task.setUpdatedAt(Instant.now());
      Optional<String> canonical = resolveCanonicalName(contextUser, task);
      if (canonical.isPresent()) {
        try {
          mergeEntries(task, canonical.get());
          task.setStatus(DictionaryMergeStatus.MERGED);
          task.setLastError(null);
          task.setUpdatedAt(Instant.now());
          merged++;
          notify(task, "Автослияние дублей выполнено",
              "Категория: " + task.getCategory() + ". Объединены: " + task.getLeftName() + " / " + task.getRightName());
          continue;
        } catch (Exception ex) {
          task.setLastError(ex.getMessage());
          log.warn("Dictionary merge failed for task {}: {}", task.getId(), ex.getMessage());
        }
      }

      int attempts = (task.getAttemptCount() == null ? 0 : task.getAttemptCount()) + 1;
      task.setAttemptCount(attempts);
      if (attempts >= Math.max(1, mergeMaxAttempts)) {
        task.setStatus(DictionaryMergeStatus.MANUAL_REVIEW);
        task.setNextAttemptAt(Instant.now().plus(365, ChronoUnit.DAYS));
        manual++;
        notify(task, "Требуется модерация дублей",
            "Не удалось автоматически объединить: " + task.getLeftName() + " / " + task.getRightName());
      } else {
        task.setStatus(DictionaryMergeStatus.RETRY_SCHEDULED);
        task.setNextAttemptAt(Instant.now().plus(1, ChronoUnit.DAYS));
        postponed++;
        notify(task, "Автослияние отложено",
            "Пара: " + task.getLeftName() + " / " + task.getRightName() + ". Повтор через 1 день.");
      }
    }

    log.info("Dictionary merge queue processed: due={}, merged={}, postponed={}, manual={}", due.size(), merged, postponed, manual);
  }

  @Transactional(readOnly = true)
  public List<PlantDuplicateMergeTask> latestTasks() {
    return mergeTaskRepository.findTop100ByOrderByUpdatedAtDesc();
  }

  @Transactional
  public void markForRetry(Long taskId) {
    PlantDuplicateMergeTask task = mergeTaskRepository.findById(taskId)
        .orElseThrow(() -> new IllegalStateException("Задача не найдена"));
    task.setStatus(DictionaryMergeStatus.PENDING);
    task.setNextAttemptAt(Instant.now());
    task.setUpdatedAt(Instant.now());
    task.setLastError(null);
  }

  private void mergeEntries(PlantDuplicateMergeTask task, String canonicalName) {
    PlantDictionaryEntry left = entryRepository
        .findByCategoryAndNormalizedName(task.getCategory(), task.getLeftNormalizedName())
        .orElse(null);
    PlantDictionaryEntry right = entryRepository
        .findByCategoryAndNormalizedName(task.getCategory(), task.getRightNormalizedName())
        .orElse(null);
    if (left == null || right == null) {
      throw new IllegalStateException("Элементы словаря для слияния не найдены");
    }

    PlantDictionaryEntry target = chooseTarget(left, right, canonicalName);
    PlantDictionaryEntry source = target.getId().equals(left.getId()) ? right : left;

    target.setCanonicalName(canonicalName);
    target.setUsageCount((target.getUsageCount() == null ? 0 : target.getUsageCount())
        + (source.getUsageCount() == null ? 0 : source.getUsageCount()));
    target.setUpdatedAt(Instant.now());
    target.setLastSeenAt(Instant.now());
    entryRepository.save(target);

    upsertAlias(target, source.getCanonicalName(), 92, "AI");
    upsertAlias(target, source.getNormalizedName(), 85, "AUTO");
    upsertAlias(target, task.getLeftName(), 85, "AUTO");
    upsertAlias(target, task.getRightName(), 85, "AUTO");

    aliasRepository.findByDictionaryEntry(source).forEach(alias -> {
      alias.setDictionaryEntry(target);
      alias.setCategory(target.getCategory());
      aliasRepository.save(alias);
    });

    entryRepository.delete(source);
  }

  private void upsertAlias(PlantDictionaryEntry target, String aliasName, int confidence, String resolvedBy) {
    if (aliasName == null || aliasName.isBlank()) {
      return;
    }
    String normalized = plantNameNormalizer.normalize(aliasName);
    if (normalized.isBlank() || normalized.equals(target.getNormalizedName())) {
      return;
    }
    PlantDictionaryAlias alias = aliasRepository
        .findByCategoryAndNormalizedAliasName(target.getCategory(), normalized)
        .orElseGet(PlantDictionaryAlias::new);
    alias.setDictionaryEntry(target);
    alias.setCategory(target.getCategory());
    alias.setAliasName(aliasName.trim());
    alias.setNormalizedAliasName(normalized);
    alias.setConfidence(confidence);
    alias.setResolvedBy(resolvedBy);
    aliasRepository.save(alias);
  }

  private PlantDictionaryEntry chooseTarget(PlantDictionaryEntry left, PlantDictionaryEntry right, String canonicalName) {
    String normalizedCanonical = plantNameNormalizer.normalize(canonicalName);
    if (left.getNormalizedName().equals(normalizedCanonical)) {
      return left;
    }
    if (right.getNormalizedName().equals(normalizedCanonical)) {
      return right;
    }
    long leftCount = left.getUsageCount() == null ? 0 : left.getUsageCount();
    long rightCount = right.getUsageCount() == null ? 0 : right.getUsageCount();
    return leftCount >= rightCount ? left : right;
  }

  private Optional<String> resolveCanonicalName(User contextUser, PlantDuplicateMergeTask task) {
    Optional<String> heuristic = resolveHeuristic(task.getLeftName(), task.getRightName());
    if (heuristic.isPresent()) {
      return heuristic;
    }

    Optional<OpenRouterPlantAdvisorService.ChatAnswer> answer = openRouterPlantAdvisorService.answerGardeningQuestion(
        contextUser,
        """
            Определи, это один и тот же вид/название растения или нет.
            Категория: %s
            Вариант A: %s
            Вариант B: %s
            Ответь строго JSON:
            {"same":true|false,"canonical":"...","confidence":0-100}
            """.formatted(task.getCategory().name(), task.getLeftName(), task.getRightName())
    );
    if (answer.isEmpty()) {
      return Optional.empty();
    }

    String text = answer.get().answer();
    int l = text.indexOf('{');
    int r = text.lastIndexOf('}');
    if (l < 0 || r <= l) {
      return Optional.empty();
    }
    String json = text.substring(l, r + 1);
    boolean same = json.toLowerCase(Locale.ROOT).contains("\"same\":true");
    if (!same) {
      return Optional.empty();
    }
    String canonical = extractCanonical(json);
    if (canonical == null || canonical.isBlank()) {
      return Optional.empty();
    }
    return Optional.of(canonical.trim());
  }

  private Optional<String> resolveHeuristic(String left, String right) {
    String l = plantNameNormalizer.normalize(left);
    String r = plantNameNormalizer.normalize(right);
    if (l.isBlank() || r.isBlank()) {
      return Optional.empty();
    }

    if (l.contains("томат") && r.contains("помидор") || l.contains("помидор") && r.contains("томат")) {
      return Optional.of("Томат");
    }
    if (l.contains("огурец") && r.contains("огур")) {
      return Optional.of("Огурец");
    }
    if (l.contains(r) || r.contains(l)) {
      return Optional.of(left.length() >= right.length() ? left.trim() : right.trim());
    }
    return Optional.empty();
  }

  private String extractCanonical(String json) {
    String marker = "\"canonical\"";
    int idx = json.toLowerCase(Locale.ROOT).indexOf(marker);
    if (idx < 0) {
      return null;
    }
    int colon = json.indexOf(':', idx);
    if (colon < 0) {
      return null;
    }
    int q1 = json.indexOf('"', colon + 1);
    if (q1 < 0) {
      return null;
    }
    int q2 = json.indexOf('"', q1 + 1);
    if (q2 < 0) {
      return null;
    }
    return json.substring(q1 + 1, q2);
  }

  private User resolveAdminUser() {
    if (adminTelegramId == null || adminTelegramId <= 0) {
      return null;
    }
    return userRepository.findByTelegramId(adminTelegramId).orElse(null);
  }

  private void notify(PlantDuplicateMergeTask task, String title, String body) {
    Instant now = Instant.now();
    if (task.getLastNotificationAt() != null && task.getLastNotificationAt().plus(12, ChronoUnit.HOURS).isAfter(now)) {
      return;
    }
    adminNotificationService.notifyAdmin(title, body);
    task.setLastNotificationAt(now);
  }
}

