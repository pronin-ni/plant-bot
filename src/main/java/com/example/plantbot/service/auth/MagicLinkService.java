package com.example.plantbot.service.auth;

import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaEmailMagicLinkRequestAccepted;
import com.example.plantbot.controller.dto.pwa.PwaUserResponse;
import com.example.plantbot.domain.AuthIdentity;
import com.example.plantbot.domain.AuthProviderType;
import com.example.plantbot.domain.MagicLink;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.AuthIdentityRepository;
import com.example.plantbot.repository.MagicLinkRepository;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.JwtService;
import com.example.plantbot.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MagicLinkService {
  private final MagicLinkRepository magicLinkRepository;
  private final UserRepository userRepository;
  private final UserService userService;
  private final AuthIdentityRepository authIdentityRepository;
  private final JwtService jwtService;
  private final EmailService emailService;
  private final MagicLinkRateLimitService magicLinkRateLimitService;
  private final MagicLinkAuditService magicLinkAuditService;

  @Value("${app.magic-link.expiry-minutes:20}")
  private long expiryMinutes;

  @Value("${app.frontend-url:http://localhost:5173/pwa}")
  private String frontendUrl;

  @Value("${app.magic-link.require-https:true}")
  private boolean requireHttps;

  @Value("${app.magic-link.allow-insecure-localhost:true}")
  private boolean allowInsecureLocalhost;

  @Value("${app.magic-link.cleanup-used-retention-minutes:30}")
  private long cleanupUsedRetentionMinutes;

  @Value("${app.magic-link.persist-email-identity:false}")
  private boolean persistEmailIdentity;

  @Transactional
  public PwaEmailMagicLinkRequestAccepted requestMagicLink(String rawEmail, String clientIp) {
    String email = normalizeEmail(rawEmail);
    if (email == null) {
      magicLinkAuditService.logEvent(
          "REQUEST_INVALID_EMAIL",
          false,
          rawEmail,
          clientIp,
          "Некорректный email в запросе",
          null
      );
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Введите корректный email");
    }

    try {
      magicLinkRateLimitService.checkRequestAllowed(clientIp, email);
    } catch (ResponseStatusException ex) {
      magicLinkAuditService.logEvent(
          "REQUEST_RATE_LIMITED",
          false,
          email,
          clientIp,
          ex.getReason(),
          null
      );
      throw ex;
    }

    // Удаляем старые и неиспользованные ссылки для email, чтобы оставалась только последняя активная.
    magicLinkRepository.deleteByEmailIgnoreCaseAndUsedFalse(email);
    magicLinkRepository.deleteByExpiresAtBefore(Instant.now());

    Instant expiresAt = Instant.now().plusSeconds(resolveExpirySeconds());
    MagicLink link = new MagicLink();
    link.setEmail(email);
    link.setToken(UUID.randomUUID().toString());
    link.setExpiresAt(expiresAt);
    link.setUsed(false);
    link = magicLinkRepository.save(link);

    try {
      emailService.sendMagicLinkEmail(email, buildVerifyUrl(link.getToken()), link.getExpiresAt());
      magicLinkAuditService.logEvent(
          "REQUEST_SENT",
          true,
          email,
          clientIp,
          "Magic-link письмо отправлено",
          null
      );
    } catch (RuntimeException ex) {
      // Если отправка не удалась, не оставляем активный токен в базе.
      magicLinkRepository.delete(link);
      magicLinkAuditService.logEvent(
          "REQUEST_SEND_FAILED",
          false,
          email,
          clientIp,
          ex.getMessage(),
          null
      );
      throw ex;
    }

    return new PwaEmailMagicLinkRequestAccepted(link.getToken(), link.getExpiresAt());
  }

  @Transactional
  public PwaAuthResponse verifyMagicLink(String token, String clientIp) {
    try {
      magicLinkRateLimitService.checkVerifyAllowed(clientIp);
    } catch (ResponseStatusException ex) {
      magicLinkAuditService.logEvent(
          "VERIFY_RATE_LIMITED",
          false,
          null,
          clientIp,
          ex.getReason(),
          null
      );
      throw ex;
    }

    if (token == null || token.isBlank()) {
      magicLinkAuditService.logEvent(
          "VERIFY_TOKEN_MISSING",
          false,
          null,
          clientIp,
          "Отсутствует token",
          null
      );
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Токен не указан");
    }

    MagicLink magicLink = magicLinkRepository.findByTokenAndUsedFalse(token.trim()).orElse(null);
    if (magicLink == null) {
      magicLinkAuditService.logEvent(
          "VERIFY_TOKEN_INVALID",
          false,
          null,
          clientIp,
          "Токен не найден, использован или недействителен",
          null
      );
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Ссылка недействительна или уже использована");
    }

    if (magicLink.getExpiresAt() == null || magicLink.getExpiresAt().isBefore(Instant.now())) {
      magicLinkRepository.delete(magicLink);
      magicLinkAuditService.logEvent(
          "VERIFY_TOKEN_EXPIRED",
          false,
          magicLink.getEmail(),
          clientIp,
          "Срок действия ссылки истек",
          null
      );
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Срок действия ссылки истек");
    }

    User user = resolveOrCreateUserByEmail(magicLink.getEmail());
    if (Boolean.TRUE.equals(user.getBlocked())) {
      magicLinkAuditService.logEvent(
          "VERIFY_USER_BLOCKED",
          false,
          magicLink.getEmail(),
          clientIp,
          "Аккаунт заблокирован",
          user.getId()
      );
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован");
    }

    user.setLastSeenPwaAt(Instant.now());
    user = userService.save(user);
    if (persistEmailIdentity) {
      try {
        upsertEmailIdentity(user, magicLink.getEmail());
      } catch (RuntimeException ex) {
        // Для старых SQLite-схем с legacy CHECK по provider не блокируем сам вход пользователя.
        log.warn("Magic-link identity upsert skipped: {}", ex.getMessage());
      }
    }

    magicLink.setUsed(true);
    magicLink.setUsedAt(Instant.now());
    magicLinkRepository.save(magicLink);
    magicLinkRepository.delete(magicLink);

    magicLinkAuditService.logEvent(
        "VERIFY_SUCCESS",
        true,
        user.getEmail(),
        clientIp,
        "Успешный вход по magic-link",
        user.getId()
    );

    String jwt = jwtService.issue(user);
    return new PwaAuthResponse(jwt, jwtService.getTtlSeconds(), toUserResponse(user));
  }

  @Scheduled(cron = "${app.magic-link.cleanup-cron:0 */10 * * * *}")
  @Transactional
  public void cleanupExpiredMagicLinks() {
    Instant now = Instant.now();
    long expired = magicLinkRepository.deleteByExpiresAtBefore(now);
    long used = magicLinkRepository.deleteByUsedTrueAndUsedAtBefore(
        now.minus(Math.max(1, cleanupUsedRetentionMinutes), ChronoUnit.MINUTES)
    );
    if (expired > 0 || used > 0) {
      // Регулярная очистка чтобы не копились одноразовые токены.
      magicLinkAuditService.logEvent(
          "CLEANUP",
          true,
          null,
          "system",
          "Удалено токенов: expired=" + expired + ", used=" + used,
          null
      );
    }
  }

  private User resolveOrCreateUserByEmail(String email) {
    String normalized = normalizeEmail(email);
    if (normalized == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Некорректный email");
    }

    User user = authIdentityRepository.findByProviderAndProviderSubject(AuthProviderType.EMAIL, normalized)
        .map(AuthIdentity::getUser)
        .or(() -> authIdentityRepository.findFirstByEmailIgnoreCase(normalized).map(AuthIdentity::getUser))
        .or(() -> userRepository.findByEmailIgnoreCase(normalized))
        .orElseGet(() -> createNewEmailUser(normalized));

    if (user.getEmail() == null || user.getEmail().isBlank()) {
      user.setEmail(normalized);
    }
    if (user.getRoles() == null || user.getRoles().isEmpty()) {
      user.setRoles(new HashSet<>(Set.of(UserRole.ROLE_USER)));
    }

    return user;
  }

  private User createNewEmailUser(String email) {
    User user = new User();
    user.setTelegramId(allocatePseudoTelegramId());
    user.setEmail(email);
    user.setUsername(buildUsernameFromEmail(email));
    user.setFirstName("Садовод");
    user.setRoles(new HashSet<>(Set.of(UserRole.ROLE_USER)));
    user.setCreatedAt(Instant.now());
    return user;
  }

  private void upsertEmailIdentity(User user, String email) {
    String normalized = normalizeEmail(email);
    if (normalized == null) {
      return;
    }

    AuthIdentity identity = authIdentityRepository.findByProviderAndProviderSubject(AuthProviderType.EMAIL, normalized)
        .orElseGet(AuthIdentity::new);
    identity.setUser(user);
    identity.setProvider(AuthProviderType.EMAIL);
    identity.setProviderSubject(normalized);
    identity.setEmail(normalized);
    identity.setEmailVerified(true);
    identity.setLastLoginAt(Instant.now());
    authIdentityRepository.save(identity);
  }

  private String normalizeEmail(String email) {
    if (email == null) {
      return null;
    }
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    if (normalized.isBlank() || !normalized.contains("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
      return null;
    }
    return normalized;
  }

  private PwaUserResponse toUserResponse(User user) {
    Set<String> roles = user.getRoles() == null
        ? Set.of(UserRole.ROLE_USER.name())
        : user.getRoles().stream().map(Enum::name).collect(java.util.stream.Collectors.toSet());
    return new PwaUserResponse(
        user.getId(),
        user.getTelegramId(),
        user.getUsername(),
        user.getFirstName(),
        user.getEmail(),
        roles
    );
  }

  private long resolveExpirySeconds() {
    long minutes = Math.max(1, expiryMinutes);
    return minutes * 60;
  }

  private String buildUsernameFromEmail(String email) {
    int at = email.indexOf('@');
    String candidate = at > 0 ? email.substring(0, at) : "user";
    String safe = candidate.replaceAll("[^a-zA-Z0-9_.-]", "");
    if (safe.isBlank()) {
      safe = "user";
    }
    return safe + "_" + Math.abs(System.currentTimeMillis() % 10000);
  }

  private Long allocatePseudoTelegramId() {
    long seed = Math.abs(System.currentTimeMillis() + ((long) (Math.random() * 100000L)));
    return 900_000_000_000L + (seed % 99_999_999_999L);
  }

  private String buildVerifyUrl(String token) {
    if (frontendUrl == null || frontendUrl.isBlank()) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не настроен app.frontend-url");
    }
    String base = frontendUrl.trim();
    if (base.endsWith("/")) {
      base = base.substring(0, base.length() - 1);
    }
    enforceHttps(base);
    String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
    return base + "/auth/verify?token=" + encodedToken;
  }

  private void enforceHttps(String baseUrl) {
    URI uri;
    try {
      uri = URI.create(baseUrl);
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Некорректный app.frontend-url");
    }
    String scheme = uri.getScheme();
    String host = uri.getHost();
    if (!requireHttps) {
      return;
    }
    if ("https".equalsIgnoreCase(scheme)) {
      return;
    }
    if (allowInsecureLocalhost && isLocalHost(host)) {
      return;
    }
    throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "app.frontend-url должен использовать HTTPS");
  }

  private boolean isLocalHost(String host) {
    if (host == null) {
      return false;
    }
    return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
  }
}
