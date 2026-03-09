package com.example.plantbot.repository;

import com.example.plantbot.domain.MagicLinkAuditEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface MagicLinkAuditEventRepository extends JpaRepository<MagicLinkAuditEvent, Long> {
  List<MagicLinkAuditEvent> findByOrderByCreatedAtDesc(Pageable pageable);

  long deleteByCreatedAtBefore(Instant threshold);
}
