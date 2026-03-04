package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.OpenRouterDiagnoseRequest;
import com.example.plantbot.controller.dto.OpenRouterDiagnoseResponse;
import com.example.plantbot.controller.dto.OpenRouterIdentifyRequest;
import com.example.plantbot.controller.dto.OpenRouterIdentifyResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.OpenRouterVisionService;
import com.example.plantbot.service.TelegramInitDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/plant")
@RequiredArgsConstructor
public class OpenRouterAiController {
  private final TelegramInitDataService telegramInitDataService;
  private final OpenRouterVisionService openRouterVisionService;

  @PostMapping("/identify-openrouter")
  public OpenRouterIdentifyResponse identify(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody OpenRouterIdentifyRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    // user нужен для авторизации запроса; фото не сохраняем в этом endpoint.
    if (user.getId() == null) {
      throw new IllegalStateException("Unauthorized user context");
    }
    return openRouterVisionService.identifyPlant(user, request == null ? null : request.imageBase64());
  }

  @PostMapping("/diagnose-openrouter")
  public OpenRouterDiagnoseResponse diagnose(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody OpenRouterDiagnoseRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    if (user.getId() == null) {
      throw new IllegalStateException("Unauthorized user context");
    }
    return openRouterVisionService.diagnosePlant(
        user,
        request == null ? null : request.imageBase64(),
        request == null ? null : request.plantName()
    );
  }
}
