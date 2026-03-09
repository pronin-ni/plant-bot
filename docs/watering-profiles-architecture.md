# Watering Profiles Architecture (P1)

## 1) Профили полива

- `INDOOR`
- `OUTDOOR_ORNAMENTAL`
- `OUTDOOR_GARDEN`

Текущий canonical профиль в доменной модели:
- `PlantEnvironmentType` (runtime-совместимость с существующим кодом)

Дополнительно введён архитектурный enum:
- `WateringProfileType` (target-нейминг для recommendation engine)

## 2) Источник рекомендаций

- `AI`
- `HEURISTIC`
- `HYBRID`
- `FALLBACK`
- `MANUAL`

Canonical enum:
- `RecommendationSource`

## 3) Поля растения по профилям

### Общие
- `name`
- `wateringProfile` / `environmentType`
- `region` (city/region)
- `baseIntervalDays`
- `preferredWaterMl`

### INDOOR
- `potVolumeLiters`
- `placement` (`PlantPlacement`)
- `type` (`PlantType`)

### OUTDOOR_ORNAMENTAL
- `containerType` (`PlantContainerType`)
- `containerVolumeLiters`
- `sunExposure` (`SunExposure`)
- `outdoorSoilType` (`OutdoorSoilType`)
- `region`

### OUTDOOR_GARDEN
- `cropType`
- `growthStage` (`PlantGrowthStage`)
- `greenhouse`
- `outdoorSoilType` (`OutdoorSoilType`)
- `region`
- `mulched`
- `dripIrrigation`

## 4) Enum map (requested -> current)

- `WateringProfileType` -> `WateringProfileType` + runtime `PlantEnvironmentType`
- `RecommendationSource` -> `RecommendationSource`
- `PlantPlacementType` -> `PlantPlacement`
- `GrowthStage` -> `PlantGrowthStage`
- `SunlightExposure` -> `SunExposure`
- `SoilType` -> `OutdoorSoilType`
- `WateringMode` -> `WateringMode` (new)
- `SensorConfidence` -> `SensorConfidence` (new)

## 5) DTO base (contract foundation)

Уже подготовлены базовые DTO:
- `PlantWateringRecommendationDto`
- `PlantAiRecommendRequest`
- `PlantAiRecommendResponse`
- `WateringRecommendationPreviewRequest`
- `WateringRecommendationPreviewResponse`

## 6) Что хранить в БД

Обязательно:
- профиль (`wateringProfile`)
- agronomy context (container/stage/soil/sun/region)
- user overrides (`baseIntervalDays`, `preferredWaterMl`)
- last applied recommendation:
  - source
  - interval
  - water volume
  - summary
  - updatedAt

На P1 в entity уже введён основной agronomy context; snapshot последней рекомендации будет добавлен на следующем этапе.

## 7) Backend service structure

Рекомендуемая структура:
- `WateringRecommendationPreviewService`
  - preview before create/update
- `WateringRecommendationEngine` (следующий этап)
  - orchestrator AI/heuristic/hybrid/fallback
- `WateringProfileResolverService`
  - profile + defaults + normalization
- `WeatherContextService`
  - city/weather context abstraction
- `HomeAssistantPlantContextService` (future-ready)
  - normalized sensor context + confidence
- `RecommendationAuditService`
  - source tracking / observability

## 8) Future Home Assistant compatibility (без полной реализации)

Нужен normalized object:
- room
- tempC
- humidityPercent
- illuminanceLux
- soilMoisturePercent
- greenhouse/outdoor flags
- confidence (`SensorConfidence`)

Он подключается в engine как optional context.
