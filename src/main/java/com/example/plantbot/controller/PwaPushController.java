package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.pwa.PwaPushPublicKeyResponse;
import com.example.plantbot.controller.dto.pwa.PwaPushStatusResponse;
import com.example.plantbot.controller.dto.pwa.PwaPushSubscribeResponse;
import com.example.plantbot.controller.dto.pwa.PwaPushSubscriptionRequest;
import com.example.plantbot.controller.dto.pwa.PwaPushTestRequest;
import com.example.plantbot.controller.dto.pwa.PwaPushTestResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.UserRepository;
import com.example.plantbot.security.PwaPrincipal;
import com.example.plantbot.service.WebPushNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/pwa/push")
@RequiredArgsConstructor
public class PwaPushController {
  private final WebPushNotificationService webPushNotificationService;
  private final UserRepository userRepository;

  @GetMapping("/public-key")
  public PwaPushPublicKeyResponse publicKey() {
    return new PwaPushPublicKeyResponse(webPushNotificationService.isEnabled(), webPushNotificationService.getPublicKey());
  }

  @GetMapping("/status")
  public PwaPushStatusResponse status(
      Authentication authentication,
      @RequestParam(name = "endpoint", required = false) String endpoint
  ) {
    User user = requireAuthenticatedUser(authentication);
    int count = webPushNotificationService.countSubscriptions(user);
    boolean userSubscribed = count > 0;
    boolean currentDeviceSubscribed = webPushNotificationService.hasSubscription(user, endpoint);
    return new PwaPushStatusResponse(
        webPushNotificationService.isEnabled(),
        userSubscribed,
        userSubscribed,
        currentDeviceSubscribed,
        count
    );
  }

  @PostMapping("/subscribe")
  public PwaPushSubscribeResponse subscribe(
      Authentication authentication,
      @RequestBody PwaPushSubscriptionRequest request
  ) {
    User user = requireAuthenticatedUser(authentication);
    int count = webPushNotificationService.subscribe(user, request);
    return new PwaPushSubscribeResponse(true, count);
  }

  @DeleteMapping("/subscribe")
  public PwaPushSubscribeResponse unsubscribe(
      Authentication authentication,
      @RequestParam(name = "endpoint", required = false) String endpoint
  ) {
    User user = requireAuthenticatedUser(authentication);
    int count = webPushNotificationService.unsubscribe(user, endpoint);
    return new PwaPushSubscribeResponse(true, count);
  }

  @PostMapping("/test")
  public PwaPushTestResponse sendSelfTest(
      Authentication authentication,
      @RequestBody(required = false) PwaPushTestRequest request
  ) {
    User user = requireAuthenticatedUser(authentication);
    WebPushNotificationService.SendResult result = webPushNotificationService.sendPwaSelfTest(
        user,
        request != null ? request.endpoint() : null,
        request != null ? request.title() : null,
        request != null ? request.body() : null,
        request != null ? request.tag() : null
    );
    return new PwaPushTestResponse(
        result.delivered() > 0,
        result.subscriptions(),
        result.delivered(),
        result.message(),
        result.tag(),
        result.endpoints().stream()
            .map(item -> new PwaPushTestResponse.PwaPushTestEndpointResponse(
                item.endpoint(),
                item.delivered(),
                item.status(),
                item.error()
            ))
            .toList()
    );
  }

  private User requireAuthenticatedUser(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof PwaPrincipal principal)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Требуется JWT авторизация");
    }
    User user = userRepository.findById(principal.userId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Пользователь не найден"));
    if (Boolean.TRUE.equals(user.getBlocked())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован");
    }
    return user;
  }
}
