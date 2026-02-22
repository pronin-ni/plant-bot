package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.WateringLog;
import com.example.plantbot.repository.WateringLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WateringLogService {
  private final WateringLogRepository wateringLogRepository;

  public WateringLog addLog(Plant plant, LocalDate wateredAt, Double recommendedInterval,
                            Double recommendedWater, Double temperature, Double humidity) {
    WateringLog log = new WateringLog();
    log.setPlant(plant);
    log.setWateredAt(wateredAt);
    log.setRecommendedIntervalDays(recommendedInterval);
    log.setRecommendedWaterLiters(recommendedWater);
    log.setTemperatureC(temperature);
    log.setHumidityPercent(humidity);
    return wateringLogRepository.save(log);
  }

  public List<WateringLog> getLogsForMonth(Plant plant, LocalDate start, LocalDate end) {
    return wateringLogRepository.findByPlantAndWateredAtBetween(plant, start, end);
  }

  public List<WateringLog> getLatest(Plant plant) {
    return wateringLogRepository.findTop20ByPlantOrderByWateredAtDesc(plant);
  }

  public long countAll(Plant plant) {
    return wateringLogRepository.countByPlant(plant);
  }
}
