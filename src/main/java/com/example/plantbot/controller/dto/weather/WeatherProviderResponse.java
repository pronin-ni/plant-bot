package com.example.plantbot.controller.dto.weather;

import com.example.plantbot.domain.WeatherProvider;

import java.util.List;

public record WeatherProviderResponse(List<WeatherProviderItem> providers, String selected) {
  public record WeatherProviderItem(String id, String name, String description, boolean free) {
  }

  public static WeatherProviderResponse of(List<WeatherProviderItem> items, WeatherProvider selected) {
    return new WeatherProviderResponse(items, selected == null ? null : selected.name());
  }
}
