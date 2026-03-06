package com.example.plantbot.service;

import com.example.plantbot.domain.AssistantChatHistory;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.AssistantChatHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AssistantChatHistoryService {
  private static final int MAX_HISTORY_PER_USER = 10;

  private final AssistantChatHistoryRepository assistantChatHistoryRepository;

  @Transactional
  public void saveAndTrim(User user, String question, String answer, String model) {
    AssistantChatHistory row = new AssistantChatHistory();
    row.setUser(user);
    row.setQuestion(question);
    row.setAnswer(answer);
    row.setModel(model);
    assistantChatHistoryRepository.save(row);

    List<AssistantChatHistory> all = assistantChatHistoryRepository.findByUserOrderByCreatedAtDesc(user);
    if (all.size() <= MAX_HISTORY_PER_USER) {
      return;
    }
    assistantChatHistoryRepository.deleteAllInBatch(all.subList(MAX_HISTORY_PER_USER, all.size()));
  }
}
