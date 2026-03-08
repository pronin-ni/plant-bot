package com.example.plantbot.repository;

import com.example.plantbot.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
  Optional<User> findByTelegramId(Long telegramId);
  Optional<User> findByEmailIgnoreCase(String email);

  Optional<User> findByCalendarToken(String calendarToken);

  @Query("""
      select u from User u
      where (:q is null or :q = '' or
             lower(coalesce(u.username, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.firstName, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.lastName, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.email, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.city, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.cityDisplayName, '')) like lower(concat('%', :q, '%')) or
             cast(u.telegramId as string) like concat('%', :q, '%'))
      """)
  Page<User> searchUsers(@Param("q") String query, Pageable pageable);

  long countByCreatedAtAfter(Instant from);

  @Query("""
      select coalesce(nullif(trim(u.cityDisplayName), ''), nullif(trim(u.city), ''), 'Не указан'), count(u.id)
      from User u
      group by coalesce(nullif(trim(u.cityDisplayName), ''), nullif(trim(u.city), ''), 'Не указан')
      order by count(u.id) desc
      """)
  List<Object[]> topCities(Pageable pageable);

  long countByMigrationVariant(String migrationVariant);

  long countByMigrationVariantAndMigrationMigratedAtIsNotNull(String migrationVariant);

  long countByPwaOpenCountGreaterThan(int value);

  long countByMigrationMigratedAtIsNotNull();

  @Query("""
      select count(u.id) from User u
      where (u.lastSeenPwaAt is not null and u.lastSeenPwaAt >= :from)
         or (u.lastSeenTmaAt is not null and u.lastSeenTmaAt >= :from)
      """)
  long countOnlineSince(@Param("from") Instant from);

  @Query("""
      select u from User u
      where (u.lastSeenPwaAt is not null and u.lastSeenPwaAt >= :from)
         or (u.lastSeenTmaAt is not null and u.lastSeenTmaAt >= :from)
      """)
  List<User> findActiveSince(@Param("from") Instant from);
}
