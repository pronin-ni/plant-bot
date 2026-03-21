package com.example.plantbot.service;

import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantEnvironmentType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.SunExposure;
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

  // Backward-compatible overload для существующего бота/старого UI.

  // Legacy signature для уже существующего кода (бот/старые сценарии).
  public Plant addPlant(User user,
                        String name,
                        double potVolumeLiters,
                        int baseIntervalDays,
                        PlantType type,
                        PlantPlacement placement,
                        Double outdoorAreaM2,
                        OutdoorSoilType outdoorSoilType,
                        SunExposure sunExposure,
                        Boolean mulched,
                        Boolean perennial,
                        Boolean winterDormancyEnabled) {
    return addPlant(
        user,
        name,
        potVolumeLiters,
        baseIntervalDays,
        type,
        placement,
        null,
        outdoorAreaM2,
        outdoorSoilType,
        sunExposure,
        mulched,
        perennial,
        winterDormancyEnabled,
        null,
        null
    );
  }
  public Plant addPlant(User user,
                        String name,
                        double potVolumeLiters,
                        int baseIntervalDays,
                        PlantType type,
                        PlantPlacement placement,
                        Double outdoorAreaM2,
                        OutdoorSoilType outdoorSoilType,
                        SunExposure sunExposure,
                        Boolean mulched,
                        Boolean perennial,
                        Boolean winterDormancyEnabled,
                        Integer preferredWaterMl) {
    return addPlant(
        user,
        name,
        potVolumeLiters,
        baseIntervalDays,
        type,
        placement,
        null,
        outdoorAreaM2,
        outdoorSoilType,
        sunExposure,
        mulched,
        perennial,
        winterDormancyEnabled,
        preferredWaterMl,
        null
    );
  }

  public Plant addPlant(User user,
                        String name,
                        double potVolumeLiters,
                        int baseIntervalDays,
                        PlantType type,
                        PlantPlacement placement,
                        PlantCategory category,
                        Double outdoorAreaM2,
                        OutdoorSoilType outdoorSoilType,
                        SunExposure sunExposure,
                        Boolean mulched,
                        Boolean perennial,
                        Boolean winterDormancyEnabled,
                        Integer preferredWaterMl) {
    return addPlant(
        user,
        name,
        potVolumeLiters,
        baseIntervalDays,
        type,
        placement,
        category,
        outdoorAreaM2,
        outdoorSoilType,
        sunExposure,
        mulched,
        perennial,
        winterDormancyEnabled,
        preferredWaterMl,
        null
    );
  }

  public Plant addPlant(User user,
                        String name,
                        double potVolumeLiters,
                        int baseIntervalDays,
                        PlantType type,
                        PlantPlacement placement,
                        PlantCategory category,
                        Double outdoorAreaM2,
                        OutdoorSoilType outdoorSoilType,
                        SunExposure sunExposure,
                        Boolean mulched,
                        Boolean perennial,
                        Boolean winterDormancyEnabled,
                        Integer preferredWaterMl,
                        PlantEnvironmentType wateringProfile) {
    Plant plant = buildPlant(
        user,
        name,
        potVolumeLiters,
        baseIntervalDays,
        type,
        placement,
        category,
        outdoorAreaM2,
        outdoorSoilType,
        sunExposure,
        mulched,
        perennial,
        winterDormancyEnabled,
        preferredWaterMl,
        wateringProfile
    );
    return plantRepository.save(plant);
  }

  public Plant buildPlant(User user,
                          String name,
                          double potVolumeLiters,
                          int baseIntervalDays,
                          PlantType type,
                          PlantPlacement placement,
                          Double outdoorAreaM2,
                          OutdoorSoilType outdoorSoilType,
                          SunExposure sunExposure,
                          Boolean mulched,
                          Boolean perennial,
                          Boolean winterDormancyEnabled) {
    return buildPlant(
        user,
        name,
        potVolumeLiters,
        baseIntervalDays,
        type,
        placement,
        null,
        outdoorAreaM2,
        outdoorSoilType,
        sunExposure,
        mulched,
        perennial,
        winterDormancyEnabled,
        null,
        null
    );
  }

  public Plant buildPlant(User user,
                        String name,
                        double potVolumeLiters,
                        int baseIntervalDays,
                        PlantType type,
                        PlantPlacement placement,
                        PlantCategory category,
                        Double outdoorAreaM2,
                        OutdoorSoilType outdoorSoilType,
                        SunExposure sunExposure,
                        Boolean mulched,
                        Boolean perennial,
                        Boolean winterDormancyEnabled,
                        Integer preferredWaterMl,
                        PlantEnvironmentType wateringProfile) {
    Plant plant = new Plant();
    plant.setUser(user);
    plant.setName(name);
    plant.setPotVolumeLiters(potVolumeLiters);
    PlantPlacement normalizedPlacement = placement == null ? PlantPlacement.INDOOR : placement;
    plant.setPlacement(normalizedPlacement);
    PlantCategory normalizedCategory = category == null
        ? defaultCategoryByPlacement(normalizedPlacement)
        : category;
    plant.setCategory(normalizedCategory);
    plant.setWateringProfile(wateringProfile == null
        ? defaultProfileByCategory(normalizedCategory)
        : wateringProfile);
    plant.setOutdoorAreaM2(outdoorAreaM2);
    plant.setOutdoorSoilType(outdoorSoilType);
    plant.setSunExposure(sunExposure);
    plant.setMulched(mulched);
    plant.setPerennial(perennial);
    plant.setWinterDormancyEnabled(winterDormancyEnabled);
    plant.setBaseIntervalDays(baseIntervalDays);
    plant.setPreferredWaterMl(preferredWaterMl);
    plant.setLastWateredDate(LocalDate.now());
    plant.setType(type == null ? PlantType.DEFAULT : type);
    return plant;
  }

  public List<Plant> list(User user) {
    return plantRepository.findByUser(user);
  }

  public List<Plant> listAll() {
    return plantRepository.findAll();
  }

  public Plant save(Plant plant) {
    return plantRepository.save(plant);
  }

  public Plant getById(Long id) {
    return plantRepository.findById(id).orElse(null);
  }

  public Plant getByIdAndUserId(Long id, Long userId) {
    if (id == null || userId == null) {
      return null;
    }
    return plantRepository.findByIdAndUserId(id, userId).orElse(null);
  }

  public void delete(Plant plant) {
    plantRepository.delete(plant);
  }

  private PlantCategory defaultCategoryByPlacement(PlantPlacement placement) {
    return placement == PlantPlacement.OUTDOOR ? PlantCategory.OUTDOOR_DECORATIVE : PlantCategory.HOME;
  }

  private PlantEnvironmentType defaultProfileByCategory(PlantCategory category) {
    if (category == null) {
      return PlantEnvironmentType.INDOOR;
    }
    return switch (category) {
      case OUTDOOR_GARDEN -> PlantEnvironmentType.OUTDOOR_GARDEN;
      case OUTDOOR_DECORATIVE -> PlantEnvironmentType.OUTDOOR_ORNAMENTAL;
      case SEED_START -> PlantEnvironmentType.SEED_START;
      case HOME -> PlantEnvironmentType.INDOOR;
    };
  }
}
