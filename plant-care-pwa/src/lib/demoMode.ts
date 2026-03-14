import type {
  AssistantHistoryItemDto,
  CalendarEventDto,
  ChatAskResponse,
  OpenRouterDiagnoseResult,
  OpenRouterIdentifyResult,
  OpenRouterRuntimeSettingsDto,
  PlantCareAdviceDto,
  PlantDto,
  PlantPresetSuggestionDto,
  PlantProfileSuggestionDto,
  PwaPushPublicKeyDto,
  PwaPushStatusDto,
  PwaPushSubscribeDto,
  PwaPushTestDto,
  WateringRecommendationPreviewDto,
  WateringSensorContextDto,
  WeatherCurrentDto,
  WeatherForecastDto
} from '@/types/api';
import type { PlantConditionsHistoryResponse, PlantConditionsResponse } from '@/types/home-assistant';

const DEMO_PLANTS_KEY = 'plant-pwa-demo-plants';
const DEMO_ASSISTANT_HISTORY_KEY = 'plant-pwa-demo-assistant-history';

const DEMO_PRESETS: PlantPresetSuggestionDto[] = [
  { name: 'Монстера', category: 'HOME', popular: true },
  { name: 'Фикус Бенджамина', category: 'HOME', popular: true },
  { name: 'Сансевиерия', category: 'HOME', popular: true },
  { name: 'Петуния', category: 'OUTDOOR_DECORATIVE', popular: true },
  { name: 'Лаванда', category: 'OUTDOOR_DECORATIVE', popular: true },
  { name: 'Томат черри', category: 'OUTDOOR_GARDEN', popular: true },
  { name: 'Огурец', category: 'OUTDOOR_GARDEN', popular: true },
  { name: 'Клубника', category: 'OUTDOOR_GARDEN', popular: true }
];

function nowIso() {
  return new Date().toISOString();
}

function plusDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function createDefaultDemoPlants(): PlantDto[] {
  const now = new Date();
  return [
    {
      id: 900001,
      name: 'Фикус Бенджамина (демо)',
      placement: 'INDOOR',
      category: 'HOME',
      wateringProfile: 'INDOOR',
      potVolumeLiters: 2,
      lastWateredDate: plusDays(now, -2),
      nextWateringDate: plusDays(now, 2),
      baseIntervalDays: 4,
      preferredWaterMl: 240,
      recommendedIntervalDays: 4,
      recommendedWaterMl: 240,
      recommendationSource: 'BASE_PROFILE',
      recommendationSummary: 'Спокойный indoor режим без срочного полива.',
      confidenceScore: 0.76,
      recommendationGeneratedAt: nowIso(),
      photoUrl: '',
      type: 'DEFAULT',
      createdAt: plusDays(now, -20)
    },
    {
      id: 900002,
      name: 'Монстера (демо)',
      placement: 'INDOOR',
      category: 'HOME',
      wateringProfile: 'INDOOR',
      potVolumeLiters: 3,
      lastWateredDate: plusDays(now, -5),
      nextWateringDate: plusDays(now, 1),
      baseIntervalDays: 6,
      preferredWaterMl: 320,
      recommendedIntervalDays: 5,
      recommendedWaterMl: 320,
      recommendationSource: 'AI',
      recommendationSummary: 'Через день стоит полить, почва уже близка к сухой фазе.',
      confidenceScore: 0.91,
      recommendationGeneratedAt: nowIso(),
      photoUrl: '',
      type: 'TROPICAL',
      createdAt: plusDays(now, -14)
    },
    {
      id: 900003,
      name: 'Базилик на балконе (демо)',
      placement: 'OUTDOOR',
      category: 'OUTDOOR_DECORATIVE',
      wateringProfile: 'OUTDOOR_ORNAMENTAL',
      potVolumeLiters: 1.2,
      containerType: 'CONTAINER',
      region: 'Санкт-Петербург',
      lastWateredDate: plusDays(now, -1),
      nextWateringDate: plusDays(now, 1),
      baseIntervalDays: 2,
      preferredWaterMl: 120,
      recommendedIntervalDays: 2,
      recommendedWaterMl: 120,
      recommendationSource: 'WEATHER_ADJUSTED',
      recommendationSummary: 'Дождя не было, но погода умеренная — полив нужен завтра.',
      confidenceScore: 0.84,
      recommendationGeneratedAt: nowIso(),
      photoUrl: '',
      type: 'DEFAULT',
      createdAt: plusDays(now, -7)
    }
  ];
}

function parseStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readDemoPlants(): PlantDto[] {
  const fallback = createDefaultDemoPlants();
  const plants = parseStorage<PlantDto[]>(DEMO_PLANTS_KEY, fallback);
  if (!plants.length) {
    writeStorage(DEMO_PLANTS_KEY, fallback);
    return fallback;
  }
  return plants;
}

export function writeDemoPlants(plants: PlantDto[]) {
  writeStorage(DEMO_PLANTS_KEY, plants);
}

export function createDemoCalendar(plants: PlantDto[]): CalendarEventDto[] {
  return plants.map((plant) => ({
    date: (plant.nextWateringDate ?? nowIso()).slice(0, 10),
    plantId: plant.id,
    plantName: plant.name
  }));
}

export function readDemoAssistantHistory(): AssistantHistoryItemDto[] {
  return parseStorage<AssistantHistoryItemDto[]>(DEMO_ASSISTANT_HISTORY_KEY, []);
}

function writeDemoAssistantHistory(items: AssistantHistoryItemDto[]) {
  writeStorage(DEMO_ASSISTANT_HISTORY_KEY, items);
}

export function buildDemoCareAdvice(plant: PlantDto): PlantCareAdviceDto {
  const outdoor = plant.placement === 'OUTDOOR';
  return {
    wateringCycleDays: Math.max(1, plant.baseIntervalDays ?? 5),
    additives: outdoor ? ['мульча по краю контейнера'] : ['мягкая отстоянная вода'],
    soilType: outdoor ? 'Суглинистая' : 'Универсальный грунт',
    soilComposition: outdoor ? ['компост', 'садовая земля', 'перлит'] : ['торф', 'перлит', 'кора'],
    note: outdoor
      ? 'В демо учитываем базовый outdoor режим и мягкую погодную корректировку.'
      : 'В демо используем спокойный indoor режим без жёстких ограничений.',
    source: outdoor ? 'WEATHER_ADJUSTED' : 'AI'
  };
}

export function buildDemoRecommendation(plant: PlantDto): WateringRecommendationPreviewDto {
  const outdoor = plant.placement === 'OUTDOOR';
  return {
    source: outdoor ? 'WEATHER_ADJUSTED' : (plant.recommendationSource ?? 'AI'),
    environmentType: outdoor ? 'OUTDOOR_ORNAMENTAL' : 'INDOOR',
    recommendedIntervalDays: Math.max(1, plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 5),
    recommendedWaterMl: Math.max(80, plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 200),
    wateringMode: outdoor ? 'SOIL_CHECK_FIRST' : 'STANDARD',
    confidence: plant.confidenceScore ?? 0.78,
    summary: plant.recommendationSummary ?? (outdoor
      ? 'Погода мягкая, полив нужен без спешки.'
      : 'Растение в стабильном состоянии, придерживайтесь обычного графика.'),
    reasoning: outdoor
      ? ['дождя не было последние 2 дня', 'контейнер на открытом воздухе', 'температура умеренная']
      : ['учтён объём горшка', 'используется indoor профиль', 'последний полив был недавно'],
    warnings: outdoor ? [] : ['Демо-режим использует локальный mock AI.'],
    weatherUsed: outdoor,
    cyclePreview: {
      dates: Array.from({ length: 5 }, (_, index) => plusDays(new Date(), (index + 1) * Math.max(1, plant.baseIntervalDays ?? 5)))
    },
    weatherContextPreview: outdoor
      ? {
          available: true,
          city: plant.region ?? 'Санкт-Петербург',
          temperatureNowC: 19,
          humidityNowPercent: 61,
          precipitationLast24hMm: 0.2,
          precipitationForecastMm: 1.4,
          maxTemperatureNext3DaysC: 23,
          confidence: 'MEDIUM',
          warnings: []
        }
      : {
          available: false,
          confidence: 'LOW',
          warnings: ['В indoor-демо погода не влияет на итог.']
        }
  };
}

export function buildDemoWeatherCurrent(city: string): WeatherCurrentDto {
  const normalizedCity = city.trim() || 'Санкт-Петербург';
  return {
    city: normalizedCity,
    tempC: normalizedCity.toLowerCase().includes('моск') ? 17 : 16,
    humidity: 63,
    icon: 'partly_cloudy',
    description: 'Переменная облачность',
    source: 'AUTO',
    fallbackUsed: false,
    staleFallbackUsed: false,
    degraded: false,
    statusMessage: 'Демо-предпросмотр погоды работает локально.'
  };
}

export function buildDemoWeatherForecast(city: string): WeatherForecastDto {
  const base = new Date();
  return {
    city: city.trim() || 'Санкт-Петербург',
    source: 'AUTO',
    fallbackUsed: false,
    staleFallbackUsed: false,
    degraded: false,
    statusMessage: 'Демо-прогноз основан на локальных данных.',
    days: Array.from({ length: 5 }, (_, index) => ({
      date: plusDays(base, index).slice(0, 10),
      tempC: 15 + index,
      humidity: 58 + index,
      icon: index === 2 ? 'rain' : 'partly_cloudy',
      description: index === 2 ? 'Небольшой дождь' : 'Переменная облачность'
    }))
  };
}

export function searchDemoPlants(q: string, category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN'): PlantDto[] {
  const query = q.trim().toLowerCase();
  return readDemoPlants().filter((plant) => {
    const matchesCategory = !category || plant.category === category;
    const matchesQuery = !query || plant.name.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
}

export function searchDemoPresets(category: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN', q = '', limit = 12): PlantPresetSuggestionDto[] {
  const query = q.trim().toLowerCase();
  return DEMO_PRESETS.filter((item) => item.category === category && (!query || item.name.toLowerCase().includes(query))).slice(0, limit);
}

export function suggestDemoPlantProfile(name: string): PlantProfileSuggestionDto {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('базилик') || normalized.includes('томат') || normalized.includes('огур')) {
    return { found: true, intervalDays: 2, type: 'DEFAULT', source: 'demo-weather-profile' };
  }
  if (normalized.includes('монстер') || normalized.includes('фикус')) {
    return { found: true, intervalDays: 5, type: normalized.includes('монстер') ? 'TROPICAL' : 'DEFAULT', source: 'demo-indoor-profile' };
  }
  return { found: false, intervalDays: 4, type: 'DEFAULT', source: 'demo-fallback' };
}

export function createDemoPlantFromPayload(payload: Record<string, unknown>): PlantDto {
  const plants = readDemoPlants();
  const now = new Date();
  const nextId = plants.reduce((max, item) => Math.max(max, item.id), 900000) + 1;
  const interval = Math.max(1, Number(payload.baseIntervalDays ?? 4));
  const waterMl = Math.max(80, Number(payload.preferredWaterMl ?? 180));
  const placement = payload.placement === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR';
  const plant: PlantDto = {
    id: nextId,
    name: String(payload.name ?? 'Новое растение (демо)'),
    placement,
    category: (payload.category as PlantDto['category']) ?? (placement === 'OUTDOOR' ? 'OUTDOOR_DECORATIVE' : 'HOME'),
    wateringProfile: (payload.wateringProfile as PlantDto['wateringProfile']) ?? (placement === 'OUTDOOR' ? 'OUTDOOR_ORNAMENTAL' : 'INDOOR'),
    type: typeof payload.type === 'string' ? payload.type : 'DEFAULT',
    region: typeof payload.region === 'string' ? payload.region : 'Санкт-Петербург',
    containerType: (payload.containerType as PlantDto['containerType']) ?? (placement === 'OUTDOOR' ? 'CONTAINER' : 'POT'),
    potVolumeLiters: Number(payload.potVolumeLiters ?? payload.containerVolumeLiters ?? 1.5),
    outdoorSoilType: (payload.outdoorSoilType as PlantDto['outdoorSoilType']) ?? null,
    sunExposure: (payload.sunExposure as PlantDto['sunExposure']) ?? null,
    lastWateredDate: now.toISOString(),
    nextWateringDate: plusDays(now, interval),
    baseIntervalDays: interval,
    preferredWaterMl: waterMl,
    recommendedIntervalDays: interval,
    recommendedWaterMl: waterMl,
    recommendationSource: 'FALLBACK',
    recommendationSummary: 'Создано в демо-режиме. Можно сразу проверить сценарии списка и карточки.',
    confidenceScore: 0.62,
    recommendationGeneratedAt: nowIso(),
    photoUrl: '',
    createdAt: nowIso()
  };

  writeDemoPlants([...plants, plant]);
  return plant;
}

export function buildDemoAssistantReply(question: string): ChatAskResponse {
  const normalized = question.trim() || 'Как ухаживать за растением?';
  const answer = normalized.toLowerCase().includes('монстер')
    ? 'Для монстеры в демо-режиме я бы советовал полив после лёгкого подсыхания верхнего слоя, без спешки в прохладные дни.'
    : 'В демо-режиме AI отвечает локально: ориентируйтесь на влажность почвы, освещение и недавний полив, а не только на календарь.';
  const history = readDemoAssistantHistory();
  const item: AssistantHistoryItemDto = {
    id: Date.now(),
    question: normalized,
    answer,
    model: 'demo-local',
    createdAt: nowIso()
  };
  writeDemoAssistantHistory([item, ...history].slice(0, 20));
  return { ok: true, answer, model: 'demo-local' };
}

export function buildDemoPlantConditions(plantId: number): PlantConditionsResponse {
  const plant = readDemoPlants().find((item) => item.id === plantId);
  return {
    plantId,
    plantName: plant?.name ?? 'Растение',
    sampledAt: nowIso(),
    temperatureC: plant?.placement === 'OUTDOOR' ? 18 : 22,
    humidityPercent: plant?.placement === 'OUTDOOR' ? 61 : 47,
    soilMoisturePercent: plant?.placement === 'OUTDOOR' ? 42 : 38,
    illuminanceLux: plant?.placement === 'OUTDOOR' ? 11000 : 1800,
    autoAdjustmentEnabled: plant?.placement === 'OUTDOOR',
    adjustedToday: false,
    latestAdjustmentPercent: plant?.placement === 'OUTDOOR' ? 0.12 : 0,
    source: plant?.placement === 'OUTDOOR' ? 'demo-weather' : 'demo-room'
  };
}

export function buildDemoPlantConditionsHistory(plantId: number, days = 7): PlantConditionsHistoryResponse {
  const points = Array.from({ length: Math.max(1, days) }, (_, index) => {
    const sampledAt = plusDays(new Date(), -index);
    return {
      sampledAt,
      temperatureC: 18 + (index % 3),
      humidityPercent: 45 + (index % 5) * 3,
      soilMoisturePercent: 35 + (index % 4) * 4,
      illuminanceLux: 1500 + index * 120
    };
  }).reverse();
  return {
    plantId,
    days,
    points,
    adjustedToday: false,
    latestAdjustmentPercent: 0.12,
    latestAdjustmentReason: 'Демо-история основана на локальных данных.'
  };
}

export function buildDemoSensorContext(): WateringSensorContextDto {
  return {
    available: false,
    confidence: 'LOW',
    source: 'demo',
    sensorEntityIds: [],
    message: 'Home Assistant в демо-режиме не подключён.'
  };
}

export function buildDemoWeatherContextPreview(city?: string | null) {
  return {
    available: true,
    city: city?.trim() || 'Санкт-Петербург',
    region: city?.trim() || 'Санкт-Петербург',
    temperatureNowC: 18,
    humidityNowPercent: 63,
    precipitationLast24hMm: 0.2,
    precipitationForecastMm: 1.4,
    maxTemperatureNext3DaysC: 23,
    windNowMs: 4.1,
    confidence: 'MEDIUM',
    warnings: ['Демо-режим показывает пример weather context без сетевого запроса.']
  };
}

export function buildDemoIdentifyResult(): OpenRouterIdentifyResult {
  return {
    russianName: 'Монстера',
    latinName: 'Monstera deliciosa',
    family: 'Araceae',
    confidence: 0.74,
    wateringIntervalDays: 5,
    lightLevel: 'Яркий рассеянный свет',
    humidityPercent: '50–60%',
    shortDescription: 'Демо-распознавание: тропическое комнатное растение с крупными резными листьями.',
    alternatives: ['Филодендрон', 'Эпипремнум']
  };
}

export function buildDemoDiagnosisResult(plantName: string): OpenRouterDiagnoseResult {
  return {
    problem: `Лёгкий стресс листьев у растения "${plantName || 'растение'}"`,
    confidence: 0.58,
    description: 'В демо-режиме это пример мягкой диагностики без реального AI-запроса.',
    causes: ['неровный график полива', 'сухой воздух', 'адаптация после перестановки'],
    treatment: 'Проверьте влажность почвы и не меняйте режим слишком резко.',
    prevention: 'Поливайте по фактическому состоянию грунта и избегайте сквозняков.',
    urgency: 'low'
  };
}

export function getDemoOpenRouterSettings(): OpenRouterRuntimeSettingsDto {
  return {
    textModel: 'demo-local-chat',
    photoModel: 'demo-local-vision',
    hasApiKey: false
  };
}

export function getDemoPushPublicKey(): PwaPushPublicKeyDto {
  return {
    enabled: false,
    publicKey: ''
  };
}

export function getDemoPushStatus(): PwaPushStatusDto {
  return {
    enabled: false,
    subscribed: false,
    userSubscribed: false,
    currentDeviceSubscribed: false,
    subscriptionsCount: 0
  };
}

export function getDemoPushSubscribe(): PwaPushSubscribeDto {
  return {
    ok: false,
    subscriptionsCount: 0
  };
}

export function getDemoPushTest(): PwaPushTestDto {
  return {
    acceptedByProvider: false,
    subscriptions: 0,
    accepted: 0,
    message: 'Web Push недоступен в demo mode.',
    tag: 'demo-push-test',
    endpoints: []
  };
}
