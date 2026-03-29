package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.RecommendationHistoryResponseDto;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.recommendation.history.RecommendationHistoryProjectionService;
import com.example.plantbot.service.recommendation.history.RecommendationHistoryResponseMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/plants")
@RequiredArgsConstructor
public class RecommendationHistoryController {
  private final CurrentUserService currentUserService;
  private final PlantService plantService;
  private final RecommendationHistoryProjectionService historyProjectionService;
  private final RecommendationHistoryResponseMapper responseMapper;

  @GetMapping("/{plantId}/recommendation-history")
  public RecommendationHistoryResponseDto history(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestParam(name = "limit", required = false, defaultValue = "5") Integer limit,
      @RequestParam(name = "view", required = false, defaultValue = "compact") String view
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    int normalizedLimit = Math.max(1, Math.min(20, limit == null ? 5 : limit));
    var entries = historyProjectionService.buildHistoryForPlant(plant, normalizedLimit + 1);
    return responseMapper.toResponse(plantId, view, normalizedLimit, entries);
  }

  private Plant requireOwnedPlant(User user, Long plantId) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (plant.getUser() == null || !plant.getUser().getId().equals(user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
    }
    return plant;
  }
}
