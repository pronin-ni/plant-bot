package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.pwa.PwaAuthOAuthRequest;
import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaAuthTelegramWidgetRequest;
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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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

  @Value("${bot.token:}")
  private String botToken;

  @Value("${telegram.auth.max-age-seconds:86400}")
  private long telegramAuthMaxAgeSeconds;

  @Transactional
  public PwaAuthResponse loginWithTelegram(String initData) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return finalizeTelegramLogin(user);
  }

  @Transactional
  public PwaAuthResponse loginWithTelegramWidget(PwaAuthTelegramWidgetRequest request) {
    if (request == null || request.id() == null || request.id() <= 0 || request.authDate() == null || request.hash() == null || request.hash().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Некорректный Telegram payload");
    }
    if (botToken == null || botToken.isBlank()) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не настроен bot.token");
    }
    long age = Math.abs(Instant.now().getEpochSecond() - request.authDate());
    if (age > Math.max(60, telegramAuthMaxAgeSeconds)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Данные входа Telegram устарели");
    }

    String dataCheck = buildWidgetDataCheckString(request);
    String expectedHash = computeTelegramWidgetHash(dataCheck);
    if (!constantTimeEquals(expectedHash, request.hash().trim().toLowerCase(Locale.ROOT))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Подпись Telegram Login Widget не прошла проверку");
    }

    User user = userService.getOrCreateByTelegramData(
        request.id(),
        blankToNull(request.username()),
        blankToNull(request.firstName()),
        blankToNull(request.lastName())
    );
    return finalizeTelegramLogin(user);
  }

  private PwaAuthResponse finalizeTelegramLogin(User user) {
    ensureNotBlocked(user);
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

  private String buildWidgetDataCheckString(PwaAuthTelegramWidgetRequest request) {
    java.util.Map<String, String> data = new java.util.TreeMap<>();
    data.put("auth_date", String.valueOf(request.authDate()));
    data.put("id", String.valueOf(request.id()));
    if (request.firstName() != null && !request.firstName().isBlank()) {
      data.put("first_name", request.firstName());
    }
    if (request.lastName() != null && !request.lastName().isBlank()) {
      data.put("last_name", request.lastName());
    }
    if (request.username() != null && !request.username().isBlank()) {
      data.put("username", request.username());
    }
    if (request.photoUrl() != null && !request.photoUrl().isBlank()) {
      data.put("photo_url", request.photoUrl());
    }
    return data.entrySet().stream()
        .map(entry -> entry.getKey() + "=" + entry.getValue())
        .reduce((a, b) -> a + "\n" + b)
        .orElse("");
  }

  private String computeTelegramWidgetHash(String dataCheckString) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] secret = digest.digest(botToken.getBytes(StandardCharsets.UTF_8));
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      byte[] signature = mac.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));
      return hex(signature);
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Ошибка проверки Telegram Login Widget");
    }
  }

  private String hex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }

  private boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null || a.length() != b.length()) {
      return false;
    }
    int result = 0;
    for (int i = 0; i < a.length(); i++) {
      result |= a.charAt(i) ^ b.charAt(i);
    }
    return result == 0;
  }

  private String blankToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
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
    ensureNotBlocked(user);
    ensureUserDefaults(user);
    user = userService.save(user);
    upsertIdentity(user, verified);
    return toAuthResponse(user);
  }

  public PwaUserResponse me(User user) {
    ensureNotBlocked(user);
    ensureUserDefaults(user);
    user = userService.save(user);
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
    if (adminTelegramId != null && adminTelegramId > 0 && adminTelegramId.equals(user.getTelegramId())) {
      user.getRoles().add(UserRole.ROLE_ADMIN);
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

  private void ensureNotBlocked(User user) {
    if (Boolean.TRUE.equals(user.getBlocked())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован");
    }
  }

  private Long allocatePseudoTelegramId() {
    long seed = Math.abs(System.currentTimeMillis() + ((long) (Math.random() * 100000L)));
    return 900_000_000_000L + (seed % 99_999_999_999L);
  }
}
