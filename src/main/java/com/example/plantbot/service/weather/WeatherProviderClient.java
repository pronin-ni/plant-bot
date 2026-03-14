package com.example.plantbot.service.weather;

import com.example.plantbot.domain.WeatherProvider;
import com.example.plantbot.util.WeatherData;
import com.example.plantbot.util.WeatherForecastDay;

import java.util.List;
import java.util.Optional;

public interface WeatherProviderClient {
  WeatherProvider provider();

  boolean isEnabled();

  Optional<WeatherData> getCurrent(String city, Double lat, Double lon);

  List<WeatherForecastDay> getForecast(String city, Double lat, Double lon, int days);
}
