package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.pwa.PwaAuthOAuthRequest;
import com.example.plantbot.controller.dto.pwa.PwaAuthProviderResponse;
import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaAuthTelegramRequest;
import com.example.plantbot.controller.dto.pwa.PwaAuthTelegramWidgetRequest;
import com.example.plantbot.controller.dto.pwa.PwaUserResponse;
import com.example.plantbot.domain.AuthProviderType;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import com.example.plantbot.service.auth.PwaAuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetAddress;
import java.net.UnknownHostException;

@RestController
@RequestMapping("/api/pwa/auth")
@RequiredArgsConstructor
public class PwaAuthController {
  private final PwaAuthService pwaAuthService;
  private final UserRepository userRepository;

  @GetMapping("/providers")
  public PwaAuthProviderResponse providers() {
    return new PwaAuthProviderResponse(pwaAuthService.availableProviders());
  }

  @PostMapping("/telegram")
  public PwaAuthResponse telegramLogin(@RequestBody(required = false) PwaAuthTelegramRequest request) {
    String initData = request == null ? null : request.initData();
    return pwaAuthService.loginWithTelegram(initData);
  }

  @PostMapping("/dev-local")
  public PwaAuthResponse localDevLogin(HttpServletRequest request) {
    return pwaAuthService.loginWithLocalDevUser();
  }

  @PostMapping("/telegram-widget")
  public PwaAuthResponse telegramWidgetLogin(@RequestBody PwaAuthTelegramWidgetRequest request) {
    return pwaAuthService.loginWithTelegramWidget(request);
  }

  @PostMapping("/oauth/{provider}")
  public PwaAuthResponse oauthLogin(
      @PathVariable("provider") String provider,
      @RequestBody(required = false) PwaAuthOAuthRequest request
  ) {
    AuthProviderType providerType = parseProvider(provider);
    if (providerType == AuthProviderType.TELEGRAM) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Для Telegram используйте /api/pwa/auth/telegram");
    }
    return pwaAuthService.loginWithOAuth(providerType, request);
  }

  @GetMapping("/me")
  public PwaUserResponse me(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof PwaPrincipal principal)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется JWT авторизация");
    }
    var user = userRepository.findById(principal.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
    return pwaAuthService.me(user);
  }

  private AuthProviderType parseProvider(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не указан provider");
    }
    try {
      return AuthProviderType.valueOf(raw.trim().toUpperCase());
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Неподдерживаемый provider: " + raw);
    }
  }

  private boolean isLocalRequest(HttpServletRequest request) {
    if (request == null) {
      return false;
    }
    String remoteAddr = request.getRemoteAddr();
    return isLoopbackAddress(remoteAddr);
  }

  private boolean isLoopbackAddress(String rawAddress) {
    if (rawAddress == null || rawAddress.isBlank()) {
      return false;
    }
    String normalized = rawAddress.trim();
    if ("localhost".equalsIgnoreCase(normalized)) {
      return true;
    }
    if (normalized.startsWith("::ffff:127.")
        || normalized.startsWith("0:0:0:0:0:ffff:127.")
        || normalized.startsWith("0:0:0:0:0:ffff:7f00:")
        || normalized.startsWith("::ffff:7f00:")) {
      return true;
    }
    int zoneIndex = normalized.indexOf('%');
    if (zoneIndex >= 0) {
      normalized = normalized.substring(0, zoneIndex);
    }
    try {
      return InetAddress.getByName(normalized).isLoopbackAddress();
    } catch (UnknownHostException ex) {
      return false;
    }
  }
}
