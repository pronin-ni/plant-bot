package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.pwa.PwaAuthResponse;
import com.example.plantbot.controller.dto.pwa.PwaEmailMagicLinkRequest;
import com.example.plantbot.controller.dto.pwa.PwaEmailMagicLinkRequestAccepted;
import com.example.plantbot.controller.dto.pwa.PwaEmailMagicLinkRequestResponse;
import com.example.plantbot.service.auth.MagicLinkService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/email")
@RequiredArgsConstructor
public class MagicLinkAuthController {
  private final MagicLinkService magicLinkService;

  @Value("${app.dev-auth-enabled:false}")
  private boolean devAuthEnabled;

  @PostMapping("/request")
  public PwaEmailMagicLinkRequestResponse request(
      @RequestBody(required = false) PwaEmailMagicLinkRequest request,
      HttpServletRequest httpServletRequest
  ) {
    String email = request == null ? null : request.email();
    PwaEmailMagicLinkRequestAccepted accepted = magicLinkService.requestMagicLink(email, resolveClientIp(httpServletRequest));
    return new PwaEmailMagicLinkRequestResponse(
        true,
        "Проверьте почту - мы отправили волшебную ссылку",
        accepted.expiresAt(),
        devAuthEnabled ? accepted.token() : null
    );
  }

  @GetMapping("/verify")
  public PwaAuthResponse verify(
      @RequestParam("token") String token,
      HttpServletRequest httpServletRequest
  ) {
    return magicLinkService.verifyMagicLink(token, resolveClientIp(httpServletRequest));
  }

  private String resolveClientIp(HttpServletRequest request) {
    if (request == null) {
      return "unknown";
    }
    String forwardedFor = request.getHeader("X-Forwarded-For");
    if (forwardedFor != null && !forwardedFor.isBlank()) {
      String first = forwardedFor.split(",")[0].trim();
      if (!first.isBlank()) {
        return first;
      }
    }
    String realIp = request.getHeader("X-Real-IP");
    if (realIp != null && !realIp.isBlank()) {
      return realIp.trim();
    }
    String remoteAddr = request.getRemoteAddr();
    return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr;
  }
}
