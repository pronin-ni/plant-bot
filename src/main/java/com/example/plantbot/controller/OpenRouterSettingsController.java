package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.OpenRouterModelOptionResponse;
import com.example.plantbot.controller.dto.OpenRouterModelPreferencesRequest;
import com.example.plantbot.controller.dto.OpenRouterModelPreferencesResponse;
import com.example.plantbot.controller.dto.OpenRouterModelsResponse;
import com.example.plantbot.controller.dto.OpenRouterTestResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.OpenRouterPlantAdvisorService;
import com.example.plantbot.service.OpenRouterModelCatalogService;
import com.example.plantbot.service.OpenRouterUserSettingsService;
import com.example.plantbot.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
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
  private final UserService userService;
  private final OpenRouterModelCatalogService modelCatalogService;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;
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

  @GetMapping("/preferences")
  public OpenRouterModelPreferencesResponse preferences(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return toResponse(user);
  }

  @PostMapping("/preferences")
  public OpenRouterModelPreferencesResponse savePreferences(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody(required = false) OpenRouterModelPreferencesRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    user.setOpenrouterModelPlant(normalize(request == null ? null : request.plantModel()));
    user.setOpenrouterModelChat(normalize(request == null ? null : request.chatModel()));
    user.setOpenrouterModelPhotoIdentify(normalize(request == null ? null : request.photoIdentifyModel()));
    user.setOpenrouterModelPhotoDiagnose(normalize(request == null ? null : request.photoDiagnoseModel()));
    userService.save(user);
    if (request != null && request.apiKey() != null) {
      openRouterUserSettingsService.updateUserApiKey(user, request.apiKey());
    }
    return toResponse(user);
  }

  @DeleteMapping("/preferences/api-key")
  public OpenRouterModelPreferencesResponse clearApiKey(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    openRouterUserSettingsService.updateUserApiKey(user, "");
    return toResponse(user);
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

  private OpenRouterModelPreferencesResponse toResponse(User user) {
    return new OpenRouterModelPreferencesResponse(
        user.getOpenrouterModelPlant(),
        user.getOpenrouterModelChat(),
        user.getOpenrouterModelPhotoIdentify(),
        user.getOpenrouterModelPhotoDiagnose(),
        openRouterUserSettingsService.hasUserApiKey(user)
    );
  }

  private String normalize(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String cleaned = value.trim();
    String[] commaParts = cleaned.split(",");
    if (commaParts.length > 0) {
      cleaned = commaParts[0].trim();
    }
    String[] lineParts = cleaned.split("\\s+");
    if (lineParts.length > 0) {
      cleaned = lineParts[0].trim();
    }
    return cleaned.isBlank() ? null : cleaned;
  }
}
