package com.example.plantbot.repository;

import com.example.plantbot.domain.MagicLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface MagicLinkRepository extends JpaRepository<MagicLink, Long> {
  Optional<MagicLink> findByTokenAndUsedFalse(String token);

  long deleteByEmailIgnoreCaseAndUsedFalse(String email);

  long deleteByExpiresAtBefore(Instant threshold);

  long deleteByUsedTrueAndUsedAtBefore(Instant threshold);
}
