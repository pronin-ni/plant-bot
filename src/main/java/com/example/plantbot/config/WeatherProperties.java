package com.example.plantbot.config;

import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.domain.WeatherProviderStrategy;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "weather")
@Getter
@Setter
public class WeatherProperties {
  private Provider provider = new Provider();
  private WeatherProviderStrategy providerStrategy = WeatherProviderStrategy.AUTO;
  private WeatherProvider fixedProvider = WeatherProvider.OPEN_METEO;
  private List<WeatherProvider> enabledProviders = new ArrayList<>(List.of(
      WeatherProvider.OPEN_METEO,
      WeatherProvider.MET_NORWAY
  ));
  private int timeoutMs = 5000;
  private long cacheTtlMinutes = 15;
  private boolean staleFallbackEnabled = true;
  private long maxStaleAgeMinutes = 180;
  private MetNo metno = new MetNo();
  private WeatherApi weatherapi = new WeatherApi();
  private Tomorrow tomorrow = new Tomorrow();

  public WeatherProviderStrategy getProviderStrategy() {
    if (provider != null && provider.getStrategy() != null) {
      return provider.getStrategy();
    }
    return providerStrategy;
  }

  public WeatherProvider getFixedProvider() {
    if (provider != null && provider.getFixed() != null) {
      return provider.getFixed();
    }
    return fixedProvider;
  }

  public List<WeatherProvider> getEnabledProviders() {
    if (provider != null && provider.getEnabled() != null && !provider.getEnabled().isEmpty()) {
      return provider.getEnabled();
    }
    return enabledProviders;
  }

  public int getTimeoutMs() {
    if (provider != null && provider.getTimeoutMs() != null && provider.getTimeoutMs() > 0) {
      return provider.getTimeoutMs();
    }
    return timeoutMs;
  }

  public long getCacheTtlMinutes() {
    if (provider != null && provider.getCacheTtlMinutes() != null && provider.getCacheTtlMinutes() > 0) {
      return provider.getCacheTtlMinutes();
    }
    return cacheTtlMinutes;
  }

  public long getMaxStaleAgeMinutes() {
    if (provider != null && provider.getMaxStaleHours() != null && provider.getMaxStaleHours() > 0) {
      return provider.getMaxStaleHours() * 60L;
    }
    return maxStaleAgeMinutes;
  }

  @Getter
  @Setter
  public static class Provider {
    private WeatherProviderStrategy strategy = WeatherProviderStrategy.AUTO;
    private WeatherProvider fixed = null;
    private List<WeatherProvider> enabled = new ArrayList<>();
    private Integer timeoutMs = null;
    private Long cacheTtlMinutes = null;
    private Long maxStaleHours = null;
  }

  @Getter
  @Setter
  public static class MetNo {
    private String baseUrl = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
    private String userAgent = "PlantBot/1.0 (contact: plant-bot@example.com)";
  }

  @Getter
  @Setter
  public static class WeatherApi {
    private String apiKey = "";
    private String currentUrl = "https://api.weatherapi.com/v1/current.json";
    private String forecastUrl = "https://api.weatherapi.com/v1/forecast.json";
  }

  @Getter
  @Setter
  public static class Tomorrow {
    private String apiKey = "";
    private String realtimeUrl = "https://api.tomorrow.io/v4/weather/realtime";
    private String forecastUrl = "https://api.tomorrow.io/v4/weather/forecast";
  }
}
