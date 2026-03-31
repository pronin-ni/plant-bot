package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlantNoteRepository extends JpaRepository<PlantNote, String> {

    List<PlantNote> findByPlantIdOrderByCreatedAtDesc(Long plantId);

    Optional<PlantNote> findByIdAndPlantId(String id, Long plantId);
}
