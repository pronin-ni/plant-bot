package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.WateringLog;
import com.example.plantbot.repository.WateringLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalDouble;

@Service
@RequiredArgsConstructor
public class LearningService {
  private final WateringLogRepository wateringLogRepository;

  @Value("${app.learning.last-n:5}")
  private int lastN;

  @Value("${app.learning.alpha:0.5}")
  private double alpha;

  public OptionalDouble getAverageInterval(Plant plant) {
    List<WateringLog> logs = wateringLogRepository.findTop20ByPlantOrderByWateredAtDesc(plant);
    if (logs.size() < 2) {
      return OptionalDouble.empty();
    }
    List<Long> intervals = new ArrayList<>();
    for (int i = 0; i < logs.size() - 1; i++) {
      long days = ChronoUnit.DAYS.between(logs.get(i + 1).getWateredAt(), logs.get(i).getWateredAt());
      if (days > 0) {
        intervals.add(days);
      }
    }
    return intervals.stream().mapToLong(Long::longValue).average();
  }

  public OptionalDouble getSmoothedInterval(Plant plant) {
    List<WateringLog> logs = wateringLogRepository.findTop20ByPlantOrderByWateredAtDesc(plant);
    if (logs.size() < 2) {
      return OptionalDouble.empty();
    }
    List<Long> intervals = new ArrayList<>();
    for (int i = logs.size() - 1; i > 0; i--) {
      long days = ChronoUnit.DAYS.between(logs.get(i).getWateredAt(), logs.get(i - 1).getWateredAt());
      if (days > 0) {
        intervals.add(days);
      }
    }
    if (intervals.isEmpty()) {
      return OptionalDouble.empty();
    }
    int limit = Math.min(lastN, intervals.size());
    List<Long> lastIntervals = new ArrayList<>(intervals.subList(intervals.size() - limit, intervals.size()));
    if (lastIntervals.isEmpty()) {
      return OptionalDouble.empty();
    }
    double s = lastIntervals.get(0);
    for (int i = 1; i < lastIntervals.size(); i++) {
      s = alpha * lastIntervals.get(i) + (1 - alpha) * s;
    }
    return OptionalDouble.of(s);
  }
}
