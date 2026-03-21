package com.example.plantbot.repository;

import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PlantRepository extends JpaRepository<Plant, Long> {
  List<Plant> findByUser(User user);

  Optional<Plant> findByIdAndUserId(Long id, Long userId);

  List<Plant> findByUserAndNameContainingIgnoreCase(User user, String name);

  List<Plant> findByUserAndCategoryAndNameContainingIgnoreCase(User user, PlantCategory category, String name);

  @Query("""
      select p from Plant p
      join p.user u
      where (:q is null or :q = '' or
             lower(coalesce(p.name, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.username, '')) like lower(concat('%', :q, '%')) or
             lower(coalesce(u.firstName, '')) like lower(concat('%', :q, '%')) or
             cast(u.telegramId as string) like concat('%', :q, '%'))
      """)
  Page<Plant> searchPlants(@Param("q") String query, Pageable pageable);

  @Query("select p.user.id, count(p.id) from Plant p where p.user.id in :userIds group by p.user.id")
  List<Object[]> countPlantsByUserIds(@Param("userIds") List<Long> userIds);

  @Query("select p.type, count(p.id) from Plant p group by p.type order by count(p.id) desc")
  List<Object[]> countByPlantType(Pageable pageable);

  @Query("select count(p.id) from Plant p where p.lastWateredDate < :overdueDate")
  long countOverduePlants(@Param("overdueDate") java.time.LocalDate overdueDate);

  long countByPlacement(PlantPlacement placement);

  @Query("select count(distinct p.user.id) from Plant p")
  long countDistinctUsersWithPlants();

  List<Plant> findTop50ByOrderByCreatedAtDesc();
}
