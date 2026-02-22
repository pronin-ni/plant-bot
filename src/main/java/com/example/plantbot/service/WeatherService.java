package com.example.plantbot.service;

import com.example.plantbot.util.WeatherData;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class WeatherService {
  private final RestTemplate restTemplate;

  @Value("${openweather.api-key}")
  private String apiKey;

  @Value("${openweather.base-url}")
  private String baseUrl;

  @Value("${openweather.units}")
  private String units;

  public Optional<WeatherData> getCurrent(String city) {
    if (city == null || city.isBlank() || apiKey == null || apiKey.isBlank()) {
      return Optional.empty();
    }
    String encoded = URLEncoder.encode(city, StandardCharsets.UTF_8);
    String url = String.format("%s?q=%s&appid=%s&units=%s", baseUrl, encoded, apiKey, units);
    try {
      JsonNode response = restTemplate.getForObject(url, JsonNode.class);
      if (response == null || response.get("main") == null) {
        return Optional.empty();
      }
      double temp = response.get("main").get("temp").asDouble();
      double humidity = response.get("main").get("humidity").asDouble();
      return Optional.of(new WeatherData(temp, humidity));
    } catch (Exception ex) {
      return Optional.empty();
    }
  }
}
