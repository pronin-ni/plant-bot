package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.OpenRouterModelOptionResponse;
import com.example.plantbot.controller.dto.OpenRouterModelPreferencesRequest;
import com.example.plantbot.controller.dto.OpenRouterModelPreferencesResponse;
import com.example.plantbot.controller.dto.OpenRouterModelsResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.OpenRouterModelCatalogService;
import com.example.plantbot.service.TelegramInitDataService;
import com.example.plantbot.service.OpenRouterUserSettingsService;
import com.example.plantbot.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/openrouter")
@RequiredArgsConstructor
public class OpenRouterSettingsController {
  private final TelegramInitDataService telegramInitDataService;
  private final UserService userService;
  private final OpenRouterModelCatalogService modelCatalogService;
  private final OpenRouterUserSettingsService openRouterUserSettingsService;

  @GetMapping("/models")
  public OpenRouterModelsResponse models(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    telegramInitDataService.validateAndResolveUser(initData);
    User user = telegramInitDataService.validateAndResolveUser(initData);
    List<OpenRouterModelOptionResponse> models = modelCatalogService.fetchModels(user);
    return new OpenRouterModelsResponse(models);
  }

  @GetMapping("/preferences")
  public OpenRouterModelPreferencesResponse preferences(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    return toResponse(user);
  }

  @PostMapping("/preferences")
  public OpenRouterModelPreferencesResponse savePreferences(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      @RequestBody(required = false) OpenRouterModelPreferencesRequest request
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
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
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData
  ) {
    User user = telegramInitDataService.validateAndResolveUser(initData);
    openRouterUserSettingsService.updateUserApiKey(user, "");
    return toResponse(user);
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
    return value.trim();
  }
}
