package com.example.plantbot.repository;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WebPushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface WebPushSubscriptionRepository extends JpaRepository<WebPushSubscription, Long> {
  List<WebPushSubscription> findByUser(User user);

  Optional<WebPushSubscription> findByEndpoint(String endpoint);

  long deleteByUserAndEndpoint(User user, String endpoint);

  long deleteByUser(User user);

  long countByLastFailureAtAfter(Instant from);
}
