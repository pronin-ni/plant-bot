package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.OpenRouterModelOptionResponse;
import com.example.plantbot.controller.dto.OpenRouterModelsResponse;
import com.example.plantbot.controller.dto.OpenRouterTestResponse;
import com.example.plantbot.controller.dto.OpenRouterValidateKeyRequest;
import com.example.plantbot.controller.dto.OpenRouterValidateKeyResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.OpenRouterModelCatalogService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/openrouter")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class OpenRouterSettingsController {
  private static final String TEST_IMAGE_DATA_URI =
      "data:image/png;base64,"
          + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pY8kAAAAASUVORK5CYII=";

  private final CurrentUserService currentUserService;
  private final OpenRouterModelCatalogService modelCatalogService;
  private final OpenRouterPlantAdvisorService openRouterPlantAdvisorService;

  @GetMapping("/models")
  public OpenRouterModelsResponse models(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    List<OpenRouterModelOptionResponse> models = modelCatalogService.fetchModels(user);
    return new OpenRouterModelsResponse(models);
  }

  @PostMapping("/test")
  public OpenRouterTestResponse testModel(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestParam(name = "type", defaultValue = "text") String type
  ) {
    User user = currentUserService.resolve(authentication, initData);
    String normalizedType = type == null ? "text" : type.trim().toLowerCase();
    if (!"text".equals(normalizedType) && !"photo".equals(normalizedType)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "type должен быть text или photo");
    }

    String testQuestion;
    String photoBase64;
    if ("photo".equals(normalizedType)) {
      testQuestion = "Это тест vision-модели. Коротко опиши, что видно на фото.";
      photoBase64 = TEST_IMAGE_DATA_URI;
    } else {
      testQuestion = "Это тест text-модели. Назови одно неприхотливое комнатное растение.";
      photoBase64 = null;
    }

    var answer = openRouterPlantAdvisorService.answerGardeningQuestion(user, testQuestion, photoBase64);
    if (answer.isEmpty()) {
      return new OpenRouterTestResponse(
          false,
          normalizedType,
          null,
          null,
          "Тест не прошёл. Проверьте глобальный OpenRouter ключ, выбранную модель и лимиты."
      );
    }

    return new OpenRouterTestResponse(
        true,
        normalizedType,
        answer.get().model(),
        answer.get().answer(),
        "Тест успешен"
    );
  }

  @PostMapping("/validate-key")
  public OpenRouterValidateKeyResponse validateKey(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody(required = false) OpenRouterValidateKeyRequest request
  ) {
    currentUserService.resolve(authentication, initData);
    String apiKey = request == null ? null : request.apiKey();
    if (apiKey == null || apiKey.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "apiKey обязателен");
    }

    var validation = modelCatalogService.validateApiKey(apiKey);
    return new OpenRouterValidateKeyResponse(validation.ok(), validation.message());
  }
}
