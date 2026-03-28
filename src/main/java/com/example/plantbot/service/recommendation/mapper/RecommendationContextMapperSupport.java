package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.domain.GrowthStage;
import com.example.plantbot.domain.PlantGrowthStage;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.RecommendationMode;
import com.example.plantbot.domain.SoilType;
import com.example.plantbot.domain.SunExposure;
import com.example.plantbot.domain.SunlightExposure;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationExecutionMode;
import org.springframework.stereotype.Component;

@Component
public class RecommendationContextMapperSupport {
  public LocationContext buildRequestLocationContext(User user, String explicitCity, String explicitRegion) {
    String city = normalize(explicitCity);
    String region = normalize(explicitRegion);
    if (city != null || region != null) {
      return new LocationContext(
          LocationSource.REQUEST_EXPLICIT,
          city != null ? city : region,
          city != null ? city : region,
          city,
          region,
          null,
          null
      );
    }

    String userCity = normalize(user == null ? null : user.getCityDisplayName());
    if (userCity == null) {
      userCity = normalize(user == null ? null : user.getCity());
    }
    if (userCity != null) {
      return new LocationContext(
          LocationSource.USER_DEFAULT,
          userCity,
          userCity,
          userCity,
          null,
          user == null ? null : user.getCityLat(),
          user == null ? null : user.getCityLon()
      );
    }

    return new LocationContext(LocationSource.NONE, null, null, null, null, null, null);
  }

  public LocationContext buildPlantLocationContext(User user, String plantCity, String plantRegion) {
    String city = normalize(plantCity);
    String region = normalize(plantRegion);
    if (city != null || region != null) {
      return new LocationContext(
          LocationSource.PLANT_EXPLICIT,
          city != null ? city : region,
          city != null ? city : region,
          city,
          region,
          null,
          null
      );
    }
    return buildRequestLocationContext(user, null, null);
  }

  public RecommendationExecutionMode toExecutionMode(RecommendationMode mode) {
    if (mode == null) {
      return null;
    }
    try {
      return RecommendationExecutionMode.valueOf(mode.name());
    } catch (Exception ex) {
      return null;
    }
  }

  public String toProfileTypeName(Enum<?> value) {
    return value == null ? null : value.name();
  }

  public SunExposure toSunExposure(SunlightExposure sunlightExposure) {
    if (sunlightExposure == null) {
      return null;
    }
    return switch (sunlightExposure) {
      case HIGH -> SunExposure.FULL_SUN;
      case MEDIUM -> SunExposure.PARTIAL_SHADE;
      case LOW -> SunExposure.SHADE;
    };
  }

  public PlantGrowthStage toPlantGrowthStage(GrowthStage growthStage) {
    if (growthStage == null) {
      return null;
    }
    try {
      return PlantGrowthStage.valueOf(growthStage.name());
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }

  private String normalize(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
