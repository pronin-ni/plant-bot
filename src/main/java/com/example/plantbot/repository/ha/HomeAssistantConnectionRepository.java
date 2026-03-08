package com.example.plantbot.repository.ha;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.HomeAssistantConnection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HomeAssistantConnectionRepository extends JpaRepository<HomeAssistantConnection, Long> {
  Optional<HomeAssistantConnection> findByUser(User user);

  List<HomeAssistantConnection> findByConnectedTrue();

  List<HomeAssistantConnection> findTop50ByOrderByUpdatedAtDesc();

  long deleteByUser(User user);
}
