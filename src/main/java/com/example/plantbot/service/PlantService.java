package com.example.plantbot.service;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PlantService {
  private final PlantRepository plantRepository;

  public Plant addPlant(User user, String name, double potVolumeLiters, int baseIntervalDays, PlantType type) {
    Plant plant = new Plant();
    plant.setUser(user);
    plant.setName(name);
    plant.setPotVolumeLiters(potVolumeLiters);
    plant.setBaseIntervalDays(baseIntervalDays);
    plant.setLastWateredDate(LocalDate.now());
    plant.setType(type == null ? PlantType.DEFAULT : type);
    return plantRepository.save(plant);
  }

  public List<Plant> list(User user) {
    return plantRepository.findByUser(user);
  }

  public Plant save(Plant plant) {
    return plantRepository.save(plant);
  }

  public Plant getById(Long id) {
    return plantRepository.findById(id).orElse(null);
  }
}
