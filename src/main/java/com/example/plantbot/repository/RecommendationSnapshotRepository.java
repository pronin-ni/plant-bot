package com.example.plantbot.repository;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.RecommendationSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecommendationSnapshotRepository extends JpaRepository<RecommendationSnapshot, Long> {
  RecommendationSnapshot findTop1ByPlantOrderByCreatedAtDesc(Plant plant);

  List<RecommendationSnapshot> findTop50ByPlantOrderByCreatedAtDesc(Plant plant);

  List<RecommendationSnapshot> findTop100ByPlantOrderByCreatedAtDesc(Plant plant);
}
