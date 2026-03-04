package com.example.plantbot.repository.ha;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.PlantHomeAssistantBinding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PlantHomeAssistantBindingRepository extends JpaRepository<PlantHomeAssistantBinding, Long> {
  Optional<PlantHomeAssistantBinding> findByPlant(Plant plant);

  @Query("select b from PlantHomeAssistantBinding b where b.plant.user = :user")
  List<PlantHomeAssistantBinding> findAllByUser(User user);
}
