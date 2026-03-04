package com.example.plantbot.controller.dto.ha;

public record HaSensorDto(String entityId,
                          String friendlyName,
                          String kind,
                          String areaId,
                          String areaName,
                          String unit,
                          Double value,
                          boolean fromAttribute) {
}
