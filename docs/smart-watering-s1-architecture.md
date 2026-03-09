# Smart Watering Engine Architecture (S1)

## Scope of S1
This stage defines architecture only:
- recommendation profiles
- recommendation sources
- plant model fields required by engine
- DTO contracts for preview/refresh responses
- service structure and processing flow

Out of scope in S1:
- UI implementation
- full recommendation engine implementation
- Home Assistant integration

---

## Product Principle

### Indoor profiles
Primary context:
- plant type
- pot/container volume
- placement
- base interval
- season
- AI refinement
- heuristic fallback

### Outdoor profiles (ornamental/garden)
Primary context:
- weather context (current + forecast)
- soil
- sunlight
- placement
- season
- AI refinement
- heuristic fallback

### Home Assistant
Not required for the baseline scenario.
Engine must be fully functional without HA.
HA will be an optional future context provider (planned in S10).

---

## Enums (target contract)

### `WateringProfileType`
- `INDOOR`
- `OUTDOOR_ORNAMENTAL`
- `OUTDOOR_GARDEN`

### `RecommendationSource`
- `AI`
- `WEATHER_ADJUSTED`
- `HYBRID`
- `FALLBACK`
- `MANUAL`
- `BASE_PROFILE` (optional, for transparent indoor/base model result)

### `PlantPlacementType`
- `INDOOR`
- `OUTDOOR`
- `GREENHOUSE`
- `BALCONY`

### `GrowthStage`
- `SEEDLING`
- `VEGETATIVE`
- `FLOWERING`
- `FRUITING`
- `HARVEST`

### `WateringMode`
- `LIGHT`
- `STANDARD`
- `DEEP`
- `SOIL_CHECK_FIRST`
- `SKIP`

### `SunlightExposure`
- `LOW`
- `MEDIUM`
- `HIGH`

### `SoilType`
- `SANDY`
- `LOAMY`
- `CLAY`
- `PEATY`
- `ROCKY`
- `MIXED`

Note: codebase already contains close enums (`PlantPlacement`, `SunExposure`, `OutdoorSoilType`, `PlantGrowthStage`).
In S2 we align naming/contracts with migration-safe mapping instead of breaking old flows.

---

## Plant Model Fields Required by Smart Watering

### Core
- `wateringProfileType`
- `plantPlacementType`
- `baseIntervalDays`
- `manualWaterVolumeMl`
- `aiWateringEnabled`
- `weatherAdjustmentEnabled`

### Indoor-centric
- `potVolumeLiters`
- `plantType` (domain type/category)

### Outdoor-centric
- `soilType`
- `sunlightExposure`
- `growthStage`
- `city`
- `region`

### Existing/manual control
- `preferredWaterMl` (compatible with existing)
- manual override flag/source via recommendation source model

---

## Last Recommendation Storage Model

For current plant state (denormalized latest recommendation):
- `recommendedIntervalDays`
- `recommendedWaterVolumeMl`
- `recommendationSource`
- `recommendationSummary`
- `recommendationReasoningJson`
- `recommendationWarningsJson`
- `confidenceScore`
- `generatedAt`
- `wateringMode`

Rationale:
- fast rendering for app screens
- transparent explainability
- no recomputation for every read

---

## DTO Contracts (S1 Definition)

### `WateringRecommendationPreviewRequest`
- `plantName`
- `wateringProfileType`
- `plantPlacementType`
- `baseIntervalDays`
- `manualWaterVolumeMl?`
- `potVolumeLiters?`
- `soilType?`
- `sunlightExposure?`
- `growthStage?`
- `city?`
- `region?`
- `weatherAdjustmentEnabled?`
- `aiWateringEnabled?`

### `WateringRecommendationPreviewResponse`
- `source`
- `recommendedIntervalDays`
- `recommendedWaterVolumeMl`
- `wateringMode`
- `summary`
- `reasoning[]`
- `warnings[]`
- `confidenceScore`
- `weatherUsed` (boolean)
- `weatherContextPreview?`
- `generatedAt`

### `WateringCyclePreviewResponse`
- `recommendedIntervalDays`
- `recommendedWaterVolumeMl`
- `dates[]` (next 5-6 watering dates)
- `source`

### `WeatherContextPreviewResponse`
- `available`
- `city`
- `region`
- `temperatureNowC?`
- `humidityNowPercent?`
- `precip24hMm?`
- `precipForecastMm?`
- `maxTempNext3dC?`
- `confidence`
- `warnings[]`

---

## Recommendation Engine Structure (Design)

### 1. Resolver layer
`WateringProfileResolver`
- validates profile + required fields
- determines indoor/outdoor path

### 2. Context layer
- `IndoorWateringContextBuilder`
- `OutdoorWateringContextBuilder`
- `WeatherContextService` (only for outdoor path)

### 3. Base model layer
- `IndoorBaseHeuristicModel`
- `OutdoorBaseHeuristicModel`

### 4. AI refinement layer
`WateringAiRefinementService`
- profile-specific prompt builders:
  - indoor
  - outdoor ornamental
  - outdoor garden
- parses structured AI output
- guardrails/clamping

### 5. Fusion/decision layer
`WateringRecommendationComposer`
- applies source policy:
  - AI / WEATHER_ADJUSTED / HYBRID / FALLBACK / BASE_PROFILE / MANUAL
- generates final summary/reasoning/warnings/confidence

### 6. Persistence layer
`PlantRecommendationStateService`
- updates latest recommendation fields on plant
- prepares payload for snapshot/history layer (S5)

---

## Source Policy (Transparency Rules)
- If AI refinement succeeds and validated -> `AI` or `HYBRID`.
- If outdoor weather materially changed interval but AI disabled/unavailable -> `WEATHER_ADJUSTED`.
- If AI fails and system used heuristic/base model -> `FALLBACK`.
- If user manually overrides -> `MANUAL`.
- If pure baseline profile used (without weather/AI overrides) -> `BASE_PROFILE`.

No masking allowed:
- fallback cannot be reported as AI
- weather adjustments must be visible in source/reasoning

---

## Manual Override Rules
- Manual override always wins for applied values.
- Engine can still compute preview in background, but UI/plant state should mark source `MANUAL`.
- Manual mode must not be silently overwritten by scheduler (future S8 policy).

---

## API Surface Planned for S2
- `POST /api/watering/recommendation/preview`
- `POST /api/watering/recommendation/{plantId}/refresh`
- `POST /api/watering/weather/preview`

All endpoints must work without HA.

---

## Migration-Safe Notes for Current Codebase
Current code already has partial enums and recommendation fields from previous stages.
In S2 we should:
1. extend `RecommendationSource` with `WEATHER_ADJUSTED` and optional `BASE_PROFILE`;
2. introduce/migrate `PlantPlacementType`, `SunlightExposure`, `SoilType` naming with compatibility mappers;
3. keep existing API fields backward compatible where possible;
4. avoid breaking existing Add Plant flow while contracts are expanded.
