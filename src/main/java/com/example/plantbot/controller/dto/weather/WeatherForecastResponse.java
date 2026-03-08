package com.example.plantbot.controller.dto.weather;

import java.util.List;

public record WeatherForecastResponse(String city,
                                      String source,
                                      List<WeatherForecastDayResponse> days) {
  public record WeatherForecastDayResponse(String date,
                                           double tempC,
                                           Double humidity,
                                           String description) {
  }
}
