package com.example.plantbot.repository;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlantRepository extends JpaRepository<Plant, Long> {
  List<Plant> findByUser(User user);
}
