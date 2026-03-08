package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class CurrentUserService {
  private final TelegramInitDataService telegramInitDataService;
  private final UserRepository userRepository;

  public User resolve(Authentication authentication, String initData) {
    if (authentication != null && authentication.getPrincipal() instanceof PwaPrincipal principal) {
      User user = userRepository.findById(principal.userId())
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
      ensureNotBlocked(user);
      return user;
    }
    User user = telegramInitDataService.validateAndResolveUser(initData);
    ensureNotBlocked(user);
    return user;
  }

  private void ensureNotBlocked(User user) {
    if (Boolean.TRUE.equals(user.getBlocked())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован");
    }
  }
}
