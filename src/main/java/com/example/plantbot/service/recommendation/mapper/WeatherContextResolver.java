package com.example.plantbot.service.recommendation.mapper;

import com.example.plantbot.domain.User;
import com.example.plantbot.service.OutdoorWeatherContextService;
import com.example.plantbot.service.dto.NormalizedWeatherContext;
import com.example.plantbot.service.recommendation.model.LocationContext;
import com.example.plantbot.service.recommendation.model.LocationSource;
import com.example.plantbot.service.recommendation.model.RecommendationFlowType;
import com.example.plantbot.service.recommendation.model.WeatherContext;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class WeatherContextResolver {
  private final OutdoorWeatherContextService outdoorWeatherContextService;
  private final WeatherContextAdapter weatherContextAdapter;

  public WeatherContextResolver(
      OutdoorWeatherContextService outdoorWeatherContextService,
      WeatherContextAdapter weatherContextAdapter
  ) {
    this.outdoorWeatherContextService = outdoorWeatherContextService;
    this.weatherContextAdapter = weatherContextAdapter;
  }

  public WeatherContext resolve(User user, LocationContext locationContext, RecommendationFlowType flowType) {
    if (locationContext == null || locationContext.locationSource() == LocationSource.NONE || isBlank(locationContext.canonicalQuery())) {
      return weatherContextAdapter.unavailable("Локация не задана, погодный контекст недоступен.");
    }

    String requestCity = locationContext.cityLabel();
    String requestRegion = locationContext.regionLabel();
    NormalizedWeatherContext resolved = outdoorWeatherContextService.resolve(user, requestCity, requestRegion);
    return weatherContextAdapter.fromNormalized(resolved, locationContext.displayName(), flowType);
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
