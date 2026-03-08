package com.example.plantbot.repository;

import com.example.plantbot.domain.AssistantChatHistory;
import com.example.plantbot.domain.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AssistantChatHistoryRepository extends JpaRepository<AssistantChatHistory, Long> {
  List<AssistantChatHistory> findTop10ByUserOrderByCreatedAtDesc(User user);

  List<AssistantChatHistory> findByUserOrderByCreatedAtDesc(User user);

  List<AssistantChatHistory> findByUserOrderByCreatedAtDesc(User user, Pageable pageable);

  List<AssistantChatHistory> findTop50ByOrderByCreatedAtDesc();

  long deleteByUser(User user);
}
