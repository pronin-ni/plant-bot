package com.example.plantbot.repository;

import com.example.plantbot.domain.PlantReference;
import com.example.plantbot.domain.PlantType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlantReferenceRepository extends JpaRepository<PlantReference, Long> {
  Optional<PlantReference> findByType(PlantType type);
}
