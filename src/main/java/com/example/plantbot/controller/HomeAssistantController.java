package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.ha.HomeAssistantConfigRequest;
import com.example.plantbot.controller.dto.ha.HomeAssistantConfigResponse;
import com.example.plantbot.controller.dto.ha.HomeAssistantRoomsSensorsResponse;
import com.example.plantbot.controller.dto.ha.PlantConditionsHistoryResponse;
import com.example.plantbot.controller.dto.ha.PlantConditionsResponse;
import com.example.plantbot.controller.dto.ha.PlantRoomBindingRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.ha.HaSensorSelectionMode;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.PlantService;
import com.example.plantbot.service.ha.HomeAssistantApiService;
import com.example.plantbot.service.ha.HomeAssistantIntegrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HomeAssistantController {
  private final CurrentUserService currentUserService;
  private final HomeAssistantApiService haApiService;
  private final HomeAssistantIntegrationService haIntegrationService;
  private final PlantService plantService;

  @PostMapping("/home-assistant/config")
  public HomeAssistantConfigResponse saveConfig(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @RequestBody HomeAssistantConfigRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    if (request == null || request.baseUrl() == null || request.baseUrl().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "baseUrl обязателен");
    }
    if (request.token() == null || request.token().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "token обязателен");
    }

    var probe = haApiService.probe(request.baseUrl().trim(), request.token().trim());
    haIntegrationService.upsertConnection(
        user,
        request.baseUrl().trim(),
        request.token().trim(),
        probe.instanceName(),
        probe.connected()
    );

    return new HomeAssistantConfigResponse(probe.connected(), probe.message(), probe.instanceName());
  }

  @GetMapping("/home-assistant/rooms-and-sensors")
  public HomeAssistantRoomsSensorsResponse roomsAndSensors(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication
  ) {
    User user = currentUserService.resolve(authentication, initData);
    return haIntegrationService.getRoomsAndSensors(user);
  }

  @PutMapping("/plants/{plantId}/room")
  public PlantConditionsResponse bindPlantRoom(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestBody PlantRoomBindingRequest request
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);

    HaSensorSelectionMode selectionMode = parseSelectionMode(request == null ? null : request.selectionMode());
    haIntegrationService.upsertPlantBinding(
        plant,
        request == null ? null : request.areaId(),
        request == null ? null : request.areaName(),
        selectionMode,
        request == null ? null : request.temperatureEntityId(),
        request == null ? null : request.humidityEntityId(),
        request == null ? null : request.soilMoistureEntityId(),
        request == null ? null : request.illuminanceEntityId(),
        request == null ? null : request.autoAdjustmentEnabled(),
        request == null ? null : request.maxAdjustmentFraction()
    );

    return haIntegrationService.getCurrentConditionsResponse(plant);
  }

  @GetMapping("/plants/{plantId}/conditions")
  public PlantConditionsResponse getConditions(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    return haIntegrationService.getCurrentConditionsResponse(plant);
  }

  @GetMapping("/plants/{plantId}/history-conditions")
  public PlantConditionsHistoryResponse getConditionsHistory(
      @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
      Authentication authentication,
      @PathVariable("plantId") Long plantId,
      @RequestParam(name = "days", defaultValue = "7") int days
  ) {
    User user = currentUserService.resolve(authentication, initData);
    Plant plant = requireOwnedPlant(user, plantId);
    return haIntegrationService.getHistory(plant, days);
  }

  private Plant requireOwnedPlant(User user, Long plantId) {
    Plant plant = plantService.getById(plantId);
    if (plant == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено");
    }
    if (!plant.getUser().getId().equals(user.getId())) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
    }
    return plant;
  }

  private HaSensorSelectionMode parseSelectionMode(String raw) {
    if (raw == null || raw.isBlank()) {
      return HaSensorSelectionMode.AUTO_DISCOVERY;
    }
    try {
      return HaSensorSelectionMode.valueOf(raw.trim().toUpperCase());
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "selectionMode должен быть AUTO_DISCOVERY или MANUAL");
    }
  }
}
