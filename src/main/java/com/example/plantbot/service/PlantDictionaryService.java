package com.example.plantbot.service;

import com.example.plantbot.domain.DictionaryMergeStatus;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantDictionaryAlias;
import com.example.plantbot.domain.PlantDictionaryEntry;
import com.example.plantbot.domain.PlantDuplicateMergeTask;
import com.example.plantbot.repository.PlantDictionaryAliasRepository;
import com.example.plantbot.repository.PlantDictionaryEntryRepository;
import com.example.plantbot.repository.PlantDuplicateMergeTaskRepository;
import com.example.plantbot.repository.PlantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantDictionaryService {
  private final PlantRepository plantRepository;
  private final PlantDictionaryEntryRepository entryRepository;
  private final PlantDictionaryAliasRepository aliasRepository;
  private final PlantDuplicateMergeTaskRepository mergeTaskRepository;
  private final PlantNameNormalizer plantNameNormalizer;

  @Value("${app.dictionary.min-usage-for-dynamic:2}")
  private int minUsageForDynamic;

  @Value("${app.dictionary.min-usage-for-merge:3}")
  private int minUsageForMerge;

  @Value("${app.dictionary.max-merge-candidates-per-run:50}")
  private int maxMergeCandidatesPerRun;

  @Scheduled(cron = "${app.dictionary.aggregate-cron:0 20 */6 * * *}")
  @Transactional
  public void aggregateDictionary() {
    List<Plant> plants = plantRepository.findAll();
    if (plants.isEmpty()) {
      return;
    }

    Map<Key, Counter> counters = new HashMap<>();
    Instant now = Instant.now();

    for (Plant plant : plants) {
      String rawName = plant.getName();
      String normalized = plantNameNormalizer.normalize(rawName);
      if (normalized.isBlank()) {
        continue;
      }
      PlantCategory category = plant.getCategory() == null ? PlantCategory.HOME : plant.getCategory();
      Key key = new Key(category, normalized);
      Counter counter = counters.computeIfAbsent(key, k -> new Counter());
      counter.total++;
      counter.lastSeen = now;
      counter.variants.merge(rawName == null ? normalized : rawName.trim(), 1L, Long::sum);
    }

    int updated = 0;
    for (Map.Entry<Key, Counter> item : counters.entrySet()) {
      Key key = item.getKey();
      Counter counter = item.getValue();
      if (counter.total < Math.max(1, minUsageForDynamic)) {
        continue;
      }
      String canonical = counter.variants.entrySet().stream()
          .max(Map.Entry.comparingByValue())
          .map(Map.Entry::getKey)
          .orElse(key.normalizedName);

      PlantDictionaryEntry entry = entryRepository
          .findByCategoryAndNormalizedName(key.category, key.normalizedName)
          .orElseGet(PlantDictionaryEntry::new);
      if (entry.getId() == null) {
        entry.setCategory(key.category);
        entry.setNormalizedName(key.normalizedName);
        entry.setFirstSeenAt(now);
      }
      entry.setCanonicalName(canonical);
      entry.setUsageCount(counter.total);
      entry.setLastSeenAt(counter.lastSeen);
      entry.setUpdatedAt(now);
      entryRepository.save(entry);
      updated++;
    }

    int createdTasks = scheduleMergeCandidates();
    if (updated > 0 || createdTasks > 0) {
      log.info("Plant dictionary aggregate done: entriesUpdated={}, mergeTasksCreated={}", updated, createdTasks);
    }
  }

  @Transactional(readOnly = true)
  public List<String> searchDynamicPresets(PlantCategory category, String query, int limit) {
    PlantCategory effectiveCategory = category == null ? PlantCategory.HOME : category;
    String normalizedQ = plantNameNormalizer.normalize(query);
    int safeLimit = Math.max(1, Math.min(30, limit));

    List<PlantDictionaryEntry> entries = entryRepository.findByCategoryOrderByUsageCountDesc(effectiveCategory);
    List<PlantDictionaryAlias> aliases = aliasRepository.findByCategory(effectiveCategory);

    List<String> result = new ArrayList<>();
    Set<String> seen = new HashSet<>();

    for (PlantDictionaryEntry entry : entries) {
      boolean matched = normalizedQ.isBlank()
          || entry.getNormalizedName().contains(normalizedQ)
          || aliases.stream().anyMatch(alias ->
              alias.getDictionaryEntry() != null
                  && alias.getDictionaryEntry().getId().equals(entry.getId())
                  && alias.getNormalizedAliasName().contains(normalizedQ)
          );
      if (!matched) {
        continue;
      }
      if (seen.add(entry.getCanonicalName())) {
        result.add(entry.getCanonicalName());
      }
      if (result.size() >= safeLimit) {
        break;
      }
    }

    return result;
  }

  private int scheduleMergeCandidates() {
    List<PlantDictionaryEntry> allEntries = entryRepository.findAll();
    Map<PlantCategory, List<PlantDictionaryEntry>> byCategory = new HashMap<>();
    for (PlantDictionaryEntry entry : allEntries) {
      byCategory.computeIfAbsent(entry.getCategory(), k -> new ArrayList<>()).add(entry);
    }

    int created = 0;
    for (Map.Entry<PlantCategory, List<PlantDictionaryEntry>> bucket : byCategory.entrySet()) {
      List<PlantDictionaryEntry> entries = bucket.getValue().stream()
          .filter(entry -> entry.getUsageCount() != null && entry.getUsageCount() >= Math.max(1, minUsageForMerge))
          .sorted(Comparator.comparing(PlantDictionaryEntry::getUsageCount).reversed())
          .toList();
      int createdForCategory = 0;
      for (int i = 0; i < entries.size(); i++) {
        for (int j = i + 1; j < entries.size(); j++) {
          if (createdForCategory >= Math.max(1, maxMergeCandidatesPerRun)) {
            break;
          }
          PlantDictionaryEntry left = entries.get(i);
          PlantDictionaryEntry right = entries.get(j);
          if (!isLikelyDuplicate(left.getCanonicalName(), right.getCanonicalName())) {
            continue;
          }
          String leftNorm = left.getNormalizedName();
          String rightNorm = right.getNormalizedName();
          if (leftNorm.compareTo(rightNorm) > 0) {
            String t = leftNorm;
            leftNorm = rightNorm;
            rightNorm = t;
          }
          boolean exists = mergeTaskRepository
              .findByCategoryAndLeftNormalizedNameAndRightNormalizedName(bucket.getKey(), leftNorm, rightNorm)
              .isPresent();
          if (exists) {
            continue;
          }

          PlantDuplicateMergeTask task = new PlantDuplicateMergeTask();
          task.setCategory(bucket.getKey());
          task.setLeftName(left.getCanonicalName());
          task.setRightName(right.getCanonicalName());
          task.setLeftNormalizedName(leftNorm);
          task.setRightNormalizedName(rightNorm);
          task.setStatus(DictionaryMergeStatus.PENDING);
          task.setAttemptCount(0);
          task.setNextAttemptAt(Instant.now());
          task.setUpdatedAt(Instant.now());
          mergeTaskRepository.save(task);
          created++;
          createdForCategory++;
        }
      }
    }
    return created;
  }

  private boolean isLikelyDuplicate(String left, String right) {
    String a = plantNameNormalizer.normalize(left);
    String b = plantNameNormalizer.normalize(right);
    if (a.isBlank() || b.isBlank() || a.equals(b)) {
      return false;
    }
    if (a.contains(b) || b.contains(a)) {
      return true;
    }
    int distance = levenshtein(a, b);
    int threshold = Math.max(1, Math.min(4, Math.max(a.length(), b.length()) / 4));
    if (distance <= threshold) {
      return true;
    }

    Set<String> leftTokens = new HashSet<>(List.of(a.split(" ")));
    Set<String> rightTokens = new HashSet<>(List.of(b.split(" ")));
    if (leftTokens.isEmpty() || rightTokens.isEmpty()) {
      return false;
    }
    leftTokens.remove("");
    rightTokens.remove("");
    if (leftTokens.isEmpty() || rightTokens.isEmpty()) {
      return false;
    }
    leftTokens.retainAll(rightTokens);
    return !leftTokens.isEmpty();
  }

  private int levenshtein(String left, String right) {
    int[][] dp = new int[left.length() + 1][right.length() + 1];
    for (int i = 0; i <= left.length(); i++) {
      dp[i][0] = i;
    }
    for (int j = 0; j <= right.length(); j++) {
      dp[0][j] = j;
    }
    for (int i = 1; i <= left.length(); i++) {
      for (int j = 1; j <= right.length(); j++) {
        int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
        dp[i][j] = Math.min(
            Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1),
            dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[left.length()][right.length()];
  }

  private record Key(PlantCategory category, String normalizedName) {
  }

  private static final class Counter {
    private long total;
    private Instant lastSeen;
    private final Map<String, Long> variants = new HashMap<>();
  }
}

