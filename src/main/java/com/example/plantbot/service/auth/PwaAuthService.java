package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.pwa.PwaAuthOAuthRequest;
import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaUserResponse;
import com.example.plantbot.domain.AuthIdentity;
import com.example.plantbot.domain.AuthProviderType;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.AuthIdentityRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.JwtService;
import com.example.plantbot.service.TelegramInitDataService;
import com.example.plantbot.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PwaAuthService {
  private final TelegramInitDataService telegramInitDataService;
  private final UserService userService;
  private final UserRepository userRepository;
  private final AuthIdentityRepository authIdentityRepository;
  private final JwtService jwtService;
  private final List<AuthProviderVerifier> authProviderVerifiers;

  @Value("${app.admin.telegram-id:0}")
  private Long adminTelegramId;

  @Transactional
  public PwaAuthResponse loginWithTelegram(String initData) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    ensureUserDefaults(user);
    if (user.getTelegramId() != null && user.getTelegramId().equals(adminTelegramId)) {
      user.getRoles().add(UserRole.ROLE_ADMIN);
    }
    user = userService.save(user);

    upsertIdentity(user, new VerifiedExternalUser(
        AuthProviderType.TELEGRAM,
        String.valueOf(user.getTelegramId()),
        user.getEmail(),
        user.getEmail() != null && !user.getEmail().isBlank(),
        user.getUsername(),
        user.getFirstName(),
        user.getLastName(),
        user.getTelegramId()
    ));
    return toAuthResponse(user);
  }

  @Transactional
  public PwaAuthResponse loginWithOAuth(AuthProviderType providerType, PwaAuthOAuthRequest request) {
    Map<AuthProviderType, AuthProviderVerifier> verifierMap = new EnumMap<>(AuthProviderType.class);
    for (AuthProviderVerifier verifier : authProviderVerifiers) {
      verifierMap.put(verifier.provider(), verifier);
    }
    AuthProviderVerifier verifier = verifierMap.get(providerType);
    if (verifier == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Провайдер пока не поддерживается");
    }

    VerifiedExternalUser verified = verifier.verify(request);
    User user = resolveUserForExternalIdentity(verified);
    ensureUserDefaults(user);
    user = userService.save(user);
    upsertIdentity(user, verified);
    return toAuthResponse(user);
  }

  public PwaUserResponse me(User user) {
    ensureUserDefaults(user);
    return toUserResponse(user);
  }

  public List<String> availableProviders() {
    return List.of("telegram", "yandex", "vk", "google", "apple");
  }

  private User resolveUserForExternalIdentity(VerifiedExternalUser verified) {
    if (verified == null) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Не удалось проверить провайдера");
    }

    var byProviderSubject = authIdentityRepository.findByProviderAndProviderSubject(verified.provider(), verified.providerSubject());
    if (byProviderSubject.isPresent()) {
      return byProviderSubject.get().getUser();
    }

    if (verified.email() != null && !verified.email().isBlank()) {
      var byEmailIdentity = authIdentityRepository.findFirstByEmailIgnoreCase(verified.email());
      if (byEmailIdentity.isPresent()) {
        return byEmailIdentity.get().getUser();
      }
      var byEmailUser = userRepository.findByEmailIgnoreCase(verified.email());
      if (byEmailUser.isPresent()) {
        return byEmailUser.get();
      }
    }

    User created = new User();
    created.setTelegramId(allocatePseudoTelegramId());
    created.setUsername(verified.username());
    created.setFirstName(verified.firstName());
    created.setLastName(verified.lastName());
    created.setEmail(normalizeEmail(verified.email()));
    created.setCreatedAt(Instant.now());
    created.setRoles(new HashSet<>(Set.of(UserRole.ROLE_USER)));
    return created;
  }

  private void upsertIdentity(User user, VerifiedExternalUser verified) {
    AuthIdentity identity = authIdentityRepository
        .findByProviderAndProviderSubject(verified.provider(), verified.providerSubject())
        .orElseGet(AuthIdentity::new);
    identity.setUser(user);
    identity.setProvider(verified.provider());
    identity.setProviderSubject(verified.providerSubject());
    identity.setEmail(normalizeEmail(verified.email()));
    identity.setEmailVerified(verified.emailVerified());
    identity.setLastLoginAt(Instant.now());
    authIdentityRepository.save(identity);
  }

  private PwaAuthResponse toAuthResponse(User user) {
    String token = jwtService.issue(user);
    return new PwaAuthResponse(token, jwtService.getTtlSeconds(), toUserResponse(user));
  }

  private PwaUserResponse toUserResponse(User user) {
    return new PwaUserResponse(
        user.getId(),
        user.getTelegramId(),
        user.getUsername(),
        user.getFirstName(),
        user.getEmail(),
        user.getRoles().stream().map(Enum::name).collect(java.util.stream.Collectors.toSet())
    );
  }

  private void ensureUserDefaults(User user) {
    if (user.getRoles() == null || user.getRoles().isEmpty()) {
      user.setRoles(new HashSet<>(Set.of(UserRole.ROLE_USER)));
    }
    if (user.getEmail() != null) {
      user.setEmail(normalizeEmail(user.getEmail()));
    }
  }

  private String normalizeEmail(String email) {
    if (email == null || email.isBlank()) {
      return null;
    }
    return email.trim().toLowerCase(Locale.ROOT);
  }

  private Long allocatePseudoTelegramId() {
    long seed = Math.abs(System.currentTimeMillis() + ((long) (Math.random() * 100000L)));
    return 900_000_000_000L + (seed % 99_999_999_999L);
  }
}
