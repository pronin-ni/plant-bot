package com.example.plantbot.service.ha;

public record HaSensorReading(String entityId,
                              String friendlyName,
                              String areaId,
                              String areaName,
                              String unit,
                              HaSensorKind kind,
                              Double value,
                              boolean fromAttribute) {
}
