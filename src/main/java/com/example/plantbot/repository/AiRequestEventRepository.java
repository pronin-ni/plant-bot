package com.example.plantbot.repository;

import com.example.plantbot.domain.AiRequestEvent;
import com.example.plantbot.service.AiRequestAnalyticsService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface AiRequestEventRepository extends JpaRepository<AiRequestEvent, Long> {
  @Query("""
      select new com.example.plantbot.service.AiRequestAnalyticsService.AnalyticsRow(
          e.requestKind,
          e.provider,
          e.model,
          count(e),
          sum(case when e.success = true then 1 else 0 end),
          sum(case when e.success = false then 1 else 0 end),
          max(case when e.success = true then e.createdAt else null end),
          max(case when e.success = false then e.createdAt else null end)
      )
      from AiRequestEvent e
      where e.createdAt >= :from
      group by e.requestKind, e.provider, e.model
      order by count(e) desc, e.requestKind asc, e.provider asc, e.model asc
      """)
  List<AiRequestAnalyticsService.AnalyticsRow> aggregateSince(@Param("from") Instant from);

  @Query("""
      select count(e)
      from AiRequestEvent e
      where e.createdAt >= :from
      """)
  long countSince(@Param("from") Instant from);

  @Query("""
      select sum(case when e.success = true then 1 else 0 end)
      from AiRequestEvent e
      where e.createdAt >= :from
      """)
  Long countSuccessSince(@Param("from") Instant from);

  @Query("""
      select sum(case when e.success = false then 1 else 0 end)
      from AiRequestEvent e
      where e.createdAt >= :from
      """)
  Long countFailureSince(@Param("from") Instant from);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Transactional
  long deleteByCreatedAtBefore(Instant threshold);
}
