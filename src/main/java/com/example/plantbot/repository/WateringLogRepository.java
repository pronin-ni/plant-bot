package com.example.plantbot.repository;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.WateringLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface WateringLogRepository extends JpaRepository<WateringLog, Long> {
  List<WateringLog> findTop20ByPlantOrderByWateredAtDesc(Plant plant);

  List<WateringLog> findByPlantAndWateredAtBetween(Plant plant, LocalDate start, LocalDate end);

  long countByPlant(Plant plant);

  @Query("""
      select count(distinct wl.plant.user.id)
      from WateringLog wl
      where wl.wateredAt >= :fromDate
      """)
  long countDistinctUsersActiveSince(@Param("fromDate") LocalDate fromDate);
}
