package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantGrowthEntry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface PlantGrowthEntryRepository extends JpaRepository<PlantGrowthEntry, Long> {

    @Query("SELECT e FROM PlantGrowthEntry e WHERE e.plant.id = :plantId ORDER BY e.createdAt DESC")
    List<PlantGrowthEntry> findByPlantIdOrderByCreatedAtDesc(@Param("plantId") Long plantId, Pageable pageable);

    @Query("SELECT e FROM PlantGrowthEntry e WHERE e.plant.id = :plantId ORDER BY e.createdAt DESC")
    List<PlantGrowthEntry> findByPlantIdOrderByCreatedAtDesc(@Param("plantId") Long plantId);

    @Query("SELECT e FROM PlantGrowthEntry e WHERE e.plant.id = :plantId AND e.createdAt < :before ORDER BY e.createdAt DESC")
    List<PlantGrowthEntry> findByPlantIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            @Param("plantId") Long plantId, 
            @Param("before") Instant before, 
            Pageable pageable);

    @Query("SELECT COUNT(e) FROM PlantGrowthEntry e WHERE e.plant.id = :plantId")
    long countByPlantId(@Param("plantId") Long plantId);

    Optional<PlantGrowthEntry> findByIdAndPlantId(Long id, Long plantId);

    void deleteByIdAndPlantId(Long id, Long plantId);
}
