package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.objects.Message;

@Service
@RequiredArgsConstructor
public class UserService {
  private final UserRepository userRepository;

  public User getOrCreate(Message message) {
    Long telegramId = message.getFrom().getId();
    return userRepository.findByTelegramId(telegramId)
        .orElseGet(() -> {
          User user = new User();
          user.setTelegramId(telegramId);
          user.setUsername(message.getFrom().getUserName());
          user.setFirstName(message.getFrom().getFirstName());
          user.setLastName(message.getFrom().getLastName());
          return userRepository.save(user);
        });
  }

  public User getOrCreate(org.telegram.telegrambots.meta.api.objects.User tgUser) {
    Long telegramId = tgUser.getId();
    return userRepository.findByTelegramId(telegramId)
        .orElseGet(() -> {
          User user = new User();
          user.setTelegramId(telegramId);
          user.setUsername(tgUser.getUserName());
          user.setFirstName(tgUser.getFirstName());
          user.setLastName(tgUser.getLastName());
          return userRepository.save(user);
        });
  }

  public User save(User user) {
    return userRepository.save(user);
  }
}
