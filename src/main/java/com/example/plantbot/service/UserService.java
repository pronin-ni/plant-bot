package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.objects.Message;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
  private static final int MAX_SQLITE_RETRIES = 5;
  private final ConcurrentHashMap<String, ReentrantLock> userLocks = new ConcurrentHashMap<>();
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
    return saveWithRetry(userLockKey(user), () -> userRepository.save(user));
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
    return changed[0] ? saveWithRetry(telegramLockKey(telegramId), () -> userRepository.save(user)) : user;
  }

  private User saveWithRetry(String lockKey, java.util.function.Supplier<User> saveAction) {
    ReentrantLock lock = userLocks.computeIfAbsent(lockKey, ignored -> new ReentrantLock());
    lock.lock();
    try {
      RuntimeException lastFailure = null;
      for (int attempt = 1; attempt <= MAX_SQLITE_RETRIES; attempt++) {
        try {
          return saveAction.get();
        } catch (RuntimeException ex) {
          lastFailure = ex;
          if (!isRetryableSqliteWriteFailure(ex) || attempt == MAX_SQLITE_RETRIES) {
            throw ex;
          }
          log.warn("Retrying user write for key={} attempt={} because of transient DB contention: {}", lockKey, attempt, ex.getMessage());
          sleepBeforeRetry(attempt);
        }
      }
      throw lastFailure == null ? new IllegalStateException("Unknown user save failure") : lastFailure;
    } finally {
      try {
        if (!lock.hasQueuedThreads()) {
          userLocks.remove(lockKey, lock);
        }
      } finally {
        lock.unlock();
      }
    }
  }

  private boolean isRetryableSqliteWriteFailure(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof JpaSystemException || current.getClass().getName().contains("SQLite")) {
        String message = current.getMessage();
        if (message != null) {
          String lower = message.toLowerCase();
          if (lower.contains("database is locked") || lower.contains("sqlite_busy") || lower.contains("busy") || lower.contains("locked")) {
            return true;
          }
        }
      }
      current = current.getCause();
    }
    return false;
  }

  private void sleepBeforeRetry(int attempt) {
    try {
      Thread.sleep(100L * attempt);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }

  private String userLockKey(User user) {
    if (user == null) {
      return "user:unknown";
    }
    if (user.getTelegramId() != null) {
      return telegramLockKey(user.getTelegramId());
    }
    if (user.getId() != null) {
      return "user-id:" + user.getId();
    }
    return "user:unknown";
  }

  private String telegramLockKey(Long telegramId) {
    return telegramId == null ? "telegram:unknown" : "telegram:" + telegramId;
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
