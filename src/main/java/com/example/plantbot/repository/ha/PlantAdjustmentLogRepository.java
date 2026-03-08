package com.example.plantbot.repository.ha;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.ha.PlantAdjustmentLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface PlantAdjustmentLogRepository extends JpaRepository<PlantAdjustmentLog, Long> {
  List<PlantAdjustmentLog> findByPlantAndCreatedAtAfterOrderByCreatedAtDesc(Plant plant, Instant createdAt);

  long deleteByPlantIn(List<Plant> plants);
}
