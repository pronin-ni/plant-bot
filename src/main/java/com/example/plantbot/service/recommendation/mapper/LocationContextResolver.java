package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.controller.dto.SeedRecommendationPreviewRequest;
import com.example.plantbot.controller.dto.WateringRecommendationPreviewRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import org.springframework.stereotype.Component;

@Component
public class LocationContextResolver {

  public LocationContext resolveForPlant(User user, Plant plant) {
    String plantCity = normalize(plant == null ? null : plant.getCity());
    String plantRegion = normalize(plant == null ? null : plant.getRegion());
    if (plantCity != null || plantRegion != null) {
      String displayName = plantCity != null ? plantCity : plantRegion;
      return new LocationContext(
          LocationSource.PLANT_EXPLICIT,
          displayName,
          displayName,
          plantCity,
          plantRegion,
          null,
          null
      );
    }
    return resolveUserDefault(user);
  }

  public LocationContext resolveForPreview(User user, WateringRecommendationPreviewRequest request) {
    String requestCity = normalize(request == null ? null : request.city());
    String requestRegion = normalize(request == null ? null : request.region());
    if (requestCity != null || requestRegion != null) {
      String displayName = requestCity != null ? requestCity : requestRegion;
      return new LocationContext(
          LocationSource.REQUEST_EXPLICIT,
          displayName,
          displayName,
          requestCity,
          requestRegion,
          null,
          null
      );
    }
    return resolveUserDefault(user);
  }

  public LocationContext resolveForSeedPreview(User user, SeedRecommendationPreviewRequest request) {
    String requestRegion = normalize(request == null ? null : request.region());
    if (requestRegion != null) {
      return new LocationContext(
          LocationSource.REQUEST_EXPLICIT,
          requestRegion,
          requestRegion,
          null,
          requestRegion,
          null,
          null
      );
    }
    return resolveUserDefault(user);
  }

  public LocationContext resolveUserDefault(User user) {
    String displayName = normalize(user == null ? null : user.getCityDisplayName());
    String canonicalCity = normalize(user == null ? null : user.getCity());
    String effectiveDisplay = displayName != null ? displayName : canonicalCity;
    if (effectiveDisplay == null) {
      return new LocationContext(
          LocationSource.NONE,
          null,
          null,
          null,
          null,
          null,
          null
      );
    }
    return new LocationContext(
        LocationSource.USER_DEFAULT,
        effectiveDisplay,
        effectiveDisplay,
        effectiveDisplay,
        null,
        user == null ? null : user.getCityLat(),
        user == null ? null : user.getCityLon()
    );
  }

  private String normalize(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    if (trimmed.isEmpty()) {
      return null;
    }
    String lowered = trimmed.toLowerCase();
    if ("null".equals(lowered) || "undefined".equals(lowered)) {
      return null;
    }
    return trimmed;
  }
}
