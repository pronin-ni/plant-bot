package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.objects.Message;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {
  private final UserRepository userRepository;

  @Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  public User getOrCreate(Message message) {
    Long telegramId = message.getFrom().getId();
    return userRepository.findByTelegramId(telegramId)
        .orElseGet(() -> {
          User user = new User();
          user.setTelegramId(telegramId);
          user.setUsername(message.getFrom().getUserName());
          user.setFirstName(message.getFrom().getFirstName());
          user.setLastName(message.getFrom().getLastName());
          ensureDefaults(user);
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
          ensureDefaults(user);
          return userRepository.save(user);
        });
  }

  public User save(User user) {
    ensureDefaults(user);
    if (user.getCalendarToken() == null || user.getCalendarToken().isBlank()) {
      user.setCalendarToken(UUID.randomUUID().toString());
    }
    return userRepository.save(user);
  }

  public User getOrCreateByTelegramData(Long telegramId, String username, String firstName, String lastName) {
    boolean[] changed = {false};
    User user = userRepository.findByTelegramId(telegramId).orElseGet(() -> {
      User created = new User();
      created.setTelegramId(telegramId);
      changed[0] = true;
      return created;
    });
    if (username != null && !username.equals(user.getUsername())) {
      user.setUsername(username);
      changed[0] = true;
    }
    if (firstName != null && !firstName.equals(user.getFirstName())) {
      user.setFirstName(firstName);
      changed[0] = true;
    }
    if (lastName != null && !lastName.equals(user.getLastName())) {
      user.setLastName(lastName);
      changed[0] = true;
    }
    if (user.getCalendarToken() == null || user.getCalendarToken().isBlank()) {
      user.setCalendarToken(UUID.randomUUID().toString());
      changed[0] = true;
    }
    Set<UserRole> beforeRoles = user.getRoles() == null ? Set.of() : Set.copyOf(user.getRoles());
    ensureDefaults(user);
    if (!beforeRoles.equals(user.getRoles())) {
      changed[0] = true;
    }
    return changed[0] ? userRepository.save(user) : user;
  }

  private void ensureDefaults(User user) {
    if (user.getRoles() == null || user.getRoles().isEmpty()) {
      user.setRoles(new HashSet<>(Set.of(UserRole.ROLE_USER)));
    }
    if (adminTelegramId != null && adminTelegramId > 0 && adminTelegramId.equals(user.getTelegramId())) {
      user.getRoles().add(UserRole.ROLE_ADMIN);
    }
  }
}
