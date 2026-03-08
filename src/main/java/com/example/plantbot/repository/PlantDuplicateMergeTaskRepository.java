package com.example.plantbot.repository;

import com.example.plantbot.domain.DictionaryMergeStatus;
import com.example.plantbot.domain.PlantCategory;
import com.example.plantbot.domain.PlantDuplicateMergeTask;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PlantDuplicateMergeTaskRepository extends JpaRepository<PlantDuplicateMergeTask, Long> {
  Optional<PlantDuplicateMergeTask> findByCategoryAndLeftNormalizedNameAndRightNormalizedName(
      PlantCategory category,
      String leftNormalizedName,
      String rightNormalizedName
  );

  List<PlantDuplicateMergeTask> findByStatusInAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(
      Collection<DictionaryMergeStatus> statuses,
      Instant nextAttemptAt,
      Pageable pageable
  );

  List<PlantDuplicateMergeTask> findTop100ByOrderByUpdatedAtDesc();
}

