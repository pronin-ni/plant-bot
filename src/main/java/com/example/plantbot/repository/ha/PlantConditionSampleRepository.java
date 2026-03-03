package com.example.plantbot.repository.ha;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.ha.PlantConditionSample;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PlantConditionSampleRepository extends JpaRepository<PlantConditionSample, Long> {
  Optional<PlantConditionSample> findTopByPlantOrderBySampledAtDesc(Plant plant);

  List<PlantConditionSample> findByPlantAndSampledAtAfterOrderBySampledAtAsc(Plant plant, Instant sampledAt);
}
