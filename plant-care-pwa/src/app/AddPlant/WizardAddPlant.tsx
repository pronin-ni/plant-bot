import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Loader2,
  Search,
  Sparkles,
  Sprout,
  Trees,
  Warehouse
} from 'lucide-react';

import { PlantPhotoCapture } from '@/app/AddPlant/PlantPhotoCapture';
import { Button } from '@/components/ui/button';
import {
  aiSearchPlants,
  apiFetch,
  createPlant,
  getWateringHaOptions,
  getPwaPushPublicKey,
  getPwaPushStatus,
  previewSeedRecommendation,
  previewWateringRecommendation,
  previewWateringHaContext,
  searchPlantPresets,
  searchPlants,
  subscribePwaPush,
  suggestPlantProfile
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { ensurePushSubscription } from '@/lib/pwa';
import {
  error as hapticError,
  impactLight,
  selection,
  success as hapticSuccess,
  warning as hapticWarning
} from '@/lib/haptics';
import { useAuthStore, useUiStore } from '@/lib/store';
import type {
  HaSensorDto,
  PlantAiSearchResponseDto,
  PlantAiSearchSuggestionDto,
  OpenRouterIdentifyResult,
  PlantDto,
  PlantPresetSuggestionDto,
  SeedRecommendationPreviewDto,
  WateringRecommendationPreviewDto,
  WateringSensorContextDto
} from '@/types/api';
import type { PlantCategory } from '@/types/plant';

type WizardStep = 'environment' | 'identify' | 'conditions' | 'ai' | 'review';
type EnvironmentType = 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN' | 'SEED_START';
type PlantType = 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
type ContainerType = 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND';
type GrowthStage = 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST';
type SoilType = 'LOAMY' | 'SANDY' | 'CLAY';
type SunExposure = 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE';
type SeedStage = 'SOWN' | 'GERMINATING' | 'SPROUTED' | 'SEEDLING' | 'READY_TO_TRANSPLANT';
type SeedContainerType = 'CELL_TRAY' | 'SEED_TRAY' | 'PEAT_POT' | 'SMALL_POT' | 'PAPER_TOWEL' | 'WATER_PROPAGATION';
type SeedSubstrateType = 'SEED_START_MIX' | 'COCO_COIR' | 'PEAT_MIX' | 'MINERAL_WOOL' | 'PAPER_TOWEL' | 'WATER';
type SeedWateringMode = 'MIST' | 'BOTTOM_WATER' | 'KEEP_COVERED' | 'VENT_AND_MIST' | 'LIGHT_SURFACE_WATER' | 'CHECK_ONLY';
type AiState = 'idle' | 'loading' | 'success' | 'fallback' | 'error';
type BackendRecommendationSource = 'AI' | 'WEATHER_ADJUSTED' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL' | 'BASE_PROFILE';
type AppliedRecommendationSource =
  | 'none'
  | 'ai'
  | 'weather-adjusted'
  | 'hybrid'
  | 'fallback'
  | 'base-profile'
  | 'manual';

interface WizardRecommendation {
  source: 'ai' | 'fallback' | 'weather-adjusted' | 'hybrid' | 'base-profile' | 'manual';
  recommendedIntervalDays: number;
  recommendedWaterMl: number;
  summary: string;
  reasoning: string[];
  warnings: string[];
  profile: EnvironmentType;
}

interface SeedWizardRecommendation {
  source: 'ai' | 'fallback';
  seedStage: SeedStage;
  targetEnvironmentType: Exclude<EnvironmentType, 'SEED_START'>;
  careMode: string;
  recommendedCheckIntervalHours: number;
  recommendedWateringMode: SeedWateringMode;
  expectedGerminationDaysMin: number;
  expectedGerminationDaysMax: number;
  summary: string;
  reasoning: string[];
  warnings: string[];
}

interface WeatherContextPreviewDto {
  available: boolean;
  fallbackUsed?: boolean;
  city?: string | null;
  region?: string | null;
  temperatureNowC?: number | null;
  humidityNowPercent?: number | null;
  precipitationLast24hMm?: number | null;
  precipitationForecastMm?: number | null;
  maxTemperatureNext3DaysC?: number | null;
  windNowMs?: number | null;
  confidence?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | string;
  warnings?: string[];
}

const STEPS: Array<{ key: WizardStep; title: string }> = [
  { key: 'environment', title: 'Тип растения' },
  { key: 'identify', title: 'Определение' },
  { key: 'conditions', title: 'Условия выращивания' },
  { key: 'ai', title: 'AI расчёт полива' },
  { key: 'review', title: 'Подтверждение' }
];

function wizardStepTitle(step: WizardStep, environmentType: EnvironmentType): string {
  if (environmentType !== 'SEED_START') {
    return STEPS.find((item) => item.key === step)?.title ?? 'Шаг мастера';
  }
  switch (step) {
    case 'environment':
      return 'Тип растения';
    case 'identify':
      return 'Что проращиваем';
    case 'conditions':
      return 'Условия проращивания';
    case 'ai':
      return 'AI рекомендации для семян';
    case 'review':
      return 'Подтверждение';
    default:
      return 'Шаг мастера';
  }
}

const ENVIRONMENT_META: Record<EnvironmentType, { title: string; subtitle: string; icon: typeof Sprout; category: PlantCategory }> = {
  INDOOR: {
    title: 'Домашнее растение',
    subtitle: 'Комната, квартира, офис',
    icon: Sprout,
    category: 'HOME'
  },
  OUTDOOR_ORNAMENTAL: {
    title: 'Уличное декоративное',
    subtitle: 'Клумбы, террасы, кашпо',
    icon: Trees,
    category: 'OUTDOOR_DECORATIVE'
  },
  OUTDOOR_GARDEN: {
    title: 'Уличное садовое',
    subtitle: 'Овощи, ягоды, плодовые',
    icon: Warehouse,
    category: 'OUTDOOR_GARDEN'
  },
  SEED_START: {
    title: 'Проращивание семян',
    subtitle: 'Посев, всходы, сеянец',
    icon: Sprout,
    category: 'SEED_START'
  }
};

const PLANT_TYPE_OPTIONS: Array<{ value: PlantType; label: string }> = [
  { value: 'DEFAULT', label: 'Обычное' },
  { value: 'TROPICAL', label: 'Тропическое' },
  { value: 'FERN', label: 'Папоротник' },
  { value: 'SUCCULENT', label: 'Суккулент' },
  { value: 'CONIFER', label: 'Хвойное' }
];

const CONTAINER_OPTIONS: Array<{ value: ContainerType; label: string }> = [
  { value: 'POT', label: 'Кашпо' },
  { value: 'CONTAINER', label: 'Контейнер' },
  { value: 'FLOWERBED', label: 'Клумба' },
  { value: 'OPEN_GROUND', label: 'Открытый грунт' }
];

const GROWTH_STAGE_OPTIONS: Array<{ value: GrowthStage; label: string }> = [
  { value: 'SEEDLING', label: 'Рассада' },
  { value: 'VEGETATIVE', label: 'Вегетация' },
  { value: 'FLOWERING', label: 'Цветение' },
  { value: 'FRUITING', label: 'Плодоношение' },
  { value: 'HARVEST', label: 'Перед сбором' }
];

const SOIL_OPTIONS: Array<{ value: SoilType; label: string }> = [
  { value: 'LOAMY', label: 'Суглинистая' },
  { value: 'SANDY', label: 'Песчаная' },
  { value: 'CLAY', label: 'Глинистая' }
];

const SUN_OPTIONS: Array<{ value: SunExposure; label: string }> = [
  { value: 'FULL_SUN', label: 'Полное солнце' },
  { value: 'PARTIAL_SHADE', label: 'Полутень' },
  { value: 'SHADE', label: 'Тень' }
];

const SEED_STAGE_OPTIONS: Array<{ value: SeedStage; label: string }> = [
  { value: 'SOWN', label: 'Посеяно' },
  { value: 'GERMINATING', label: 'Прорастает' },
  { value: 'SPROUTED', label: 'Появились всходы' },
  { value: 'SEEDLING', label: 'Сеянец' },
  { value: 'READY_TO_TRANSPLANT', label: 'Готово к пересадке' }
];

const SEED_CONTAINER_OPTIONS: Array<{ value: SeedContainerType; label: string }> = [
  { value: 'CELL_TRAY', label: 'Кассета' },
  { value: 'SEED_TRAY', label: 'Лоток' },
  { value: 'PEAT_POT', label: 'Торфяной стаканчик' },
  { value: 'SMALL_POT', label: 'Небольшой горшок' },
  { value: 'PAPER_TOWEL', label: 'Салфетка / бумага' },
  { value: 'WATER_PROPAGATION', label: 'Вода' }
];

const SEED_SUBSTRATE_OPTIONS: Array<{ value: SeedSubstrateType; label: string }> = [
  { value: 'SEED_START_MIX', label: 'Смесь для рассады' },
  { value: 'COCO_COIR', label: 'Кокосовый субстрат' },
  { value: 'PEAT_MIX', label: 'Торфяная смесь' },
  { value: 'MINERAL_WOOL', label: 'Минеральная вата' },
  { value: 'PAPER_TOWEL', label: 'Бумага / салфетка' },
  { value: 'WATER', label: 'Вода' }
];


function seedWateringModeLabel(mode: SeedWateringMode | null | undefined): string {
  switch (mode) {
    case 'MIST':
      return 'Лёгкое опрыскивание';
    case 'BOTTOM_WATER':
      return 'Нижний полив';
    case 'KEEP_COVERED':
      return 'Держать под крышкой';
    case 'VENT_AND_MIST':
      return 'Проветривать и опрыскивать';
    case 'LIGHT_SURFACE_WATER':
      return 'Лёгкое увлажнение сверху';
    case 'CHECK_ONLY':
      return 'Только проверка';
    default:
      return 'Не задано';
  }
}

function seedSourceLabel(source: SeedWizardRecommendation['source']): string {
  return source === 'ai' ? 'AI' : 'Резервный режим';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateDefaultWaterMl(environmentType: EnvironmentType, potVolumeLiters: number, careAreaM2: number) {
  if (environmentType === 'SEED_START') {
    return 80;
  }
  if (environmentType === 'OUTDOOR_GARDEN') {
    return clamp(Math.round(Math.max(0.2, careAreaM2) * 900), 350, 4000);
  }
  if (environmentType === 'OUTDOOR_ORNAMENTAL') {
    return clamp(Math.round(Math.max(0.5, potVolumeLiters) * 170), 180, 3200);
  }
  return clamp(Math.round(Math.max(0.3, potVolumeLiters) * 130), 120, 2200);
}

function mapEnvironmentToCategory(environmentType: EnvironmentType): PlantCategory {
  return ENVIRONMENT_META[environmentType].category;
}

function formatRuDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
}

function buildCycleDates(intervalDays: number) {
  const safeInterval = clamp(intervalDays, 1, 60);
  const start = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + safeInterval * (index + 1));
    return next;
  });
}

function isOutdoorOrnamentalContainerMode(containerType: ContainerType): boolean {
  return containerType === 'POT' || containerType === 'CONTAINER';
}

function buildFallbackRecommendation(environmentType: EnvironmentType, interval: number, waterMl: number): WizardRecommendation {
  const summary = environmentType === 'INDOOR'
    ? 'Рекомендации рассчитаны по базовому indoor-профилю.'
    : environmentType === 'OUTDOOR_ORNAMENTAL'
      ? 'Рекомендации рассчитаны по базовому профилю декоративных уличных растений.'
      : environmentType === 'OUTDOOR_GARDEN'
        ? 'Рекомендации рассчитаны по базовому профилю садовых культур.'
        : 'Рекомендации рассчитаны по базовому режиму проращивания.';

  return {
    source: 'fallback',
    recommendedIntervalDays: interval,
    recommendedWaterMl: waterMl,
    summary,
    reasoning: [
      `Профиль: ${environmentType}`,
      `Базовый интервал: ${interval} дн.`,
      `Объём полива: ${waterMl} мл`
    ],
    warnings: ['AI недоступен, поэтому включён резервный режим.'],
    profile: environmentType
  };
}

function normalizeRecommendationText(value: string): string {
  return value
    .replace(/^HYBRID:/, 'Гибридный режим:')
    .replace(/^Профиль:\s*INDOOR$/, 'Профиль: домашнее растение')
    .replace(/^Профиль:\s*OUTDOOR_ORNAMENTAL$/, 'Профиль: уличное декоративное')
    .replace(/^Профиль:\s*OUTDOOR_GARDEN$/, 'Профиль: уличное садовое')
    .replace(/\bDEFAULT\b/g, 'обычное')
    .replace(/\bTROPICAL\b/g, 'тропическое')
    .replace(/\bFERN\b/g, 'папоротник')
    .replace(/\bSUCCULENT\b/g, 'суккулент')
    .replace(/\bCONIFER\b/g, 'хвойное');
}

function mapPreviewSourceToApplied(source?: BackendRecommendationSource | WateringRecommendationPreviewDto['source']): AppliedRecommendationSource {
  if (!source) {
    return 'none';
  }
  switch (source) {
    case 'AI':
      return 'ai';
    case 'WEATHER_ADJUSTED':
      return 'weather-adjusted';
    case 'HYBRID':
      return 'hybrid';
    case 'BASE_PROFILE':
      return 'base-profile';
    case 'MANUAL':
      return 'manual';
    case 'FALLBACK':
    case 'HEURISTIC':
      return 'fallback';
    default:
      return 'none';
  }
}

function mapAppliedSourceToBackend(
  source: AppliedRecommendationSource
): 'AI' | 'WEATHER_ADJUSTED' | 'HYBRID' | 'FALLBACK' | 'MANUAL' | 'BASE_PROFILE' | null {
  if (source === 'ai') {
    return 'AI';
  }
  if (source === 'weather-adjusted') {
    return 'WEATHER_ADJUSTED';
  }
  if (source === 'hybrid') {
    return 'HYBRID';
  }
  if (source === 'base-profile') {
    return 'BASE_PROFILE';
  }
  if (source === 'fallback') {
    return 'FALLBACK';
  }
  if (source === 'manual') {
    return 'MANUAL';
  }
  return null;
}

function sourceBadgeLabel(source: AppliedRecommendationSource): string {
  switch (source) {
    case 'ai':
      return 'AI';
    case 'weather-adjusted':
      return 'С учётом погоды';
    case 'hybrid':
      return 'AI + погода';
    case 'fallback':
      return 'Резервный режим';
    case 'base-profile':
      return 'Профиль растения';
    case 'manual':
      return 'Вручную';
    default:
      return 'Не выбран';
  }
}

function categoryHintLabel(category: PlantCategory): string {
  switch (category) {
    case 'HOME':
      return 'Домашнее';
    case 'OUTDOOR_DECORATIVE':
      return 'Декор';
    case 'OUTDOOR_GARDEN':
      return 'Сад';
    case 'SEED_START':
      return 'Семена';
    default:
      return category;
  }
}

function containerTypeLabel(value: ContainerType): string {
  switch (value) {
    case 'POT':
      return 'кашпо';
    case 'CONTAINER':
      return 'контейнер';
    case 'FLOWERBED':
      return 'грядка';
    case 'OPEN_GROUND':
      return 'открытый грунт';
    default:
      return value;
  }
}

function soilTypeLabel(value: SoilType): string {
  switch (value) {
    case 'LOAMY':
      return 'суглинистая почва';
    case 'SANDY':
      return 'песчаная почва';
    case 'CLAY':
      return 'глинистая почва';
    default:
      return value;
  }
}

function sunExposureLabel(value: SunExposure): string {
  switch (value) {
    case 'FULL_SUN':
      return 'полное солнце';
    case 'PARTIAL_SHADE':
      return 'полутень';
    case 'SHADE':
      return 'тень';
    default:
      return value;
  }
}

function growthStageLabel(value: GrowthStage): string {
  switch (value) {
    case 'SEEDLING':
      return 'рассада';
    case 'VEGETATIVE':
      return 'активный рост';
    case 'FLOWERING':
      return 'цветение';
    case 'FRUITING':
      return 'плодоношение';
    case 'HARVEST':
      return 'конец сезона';
    default:
      return value;
  }
}

function normalizeHaContextMessage(message?: string | null, available?: boolean): string {
  const raw = message?.trim();
  if (!raw) {
    return available ? 'Данные сенсоров будут учтены в AI шаге.' : 'Проверьте комнату и выбранные сенсоры.';
  }
  if (raw === 'Optional sensor context provider is disabled.') {
    return 'Интеграция Home Assistant сейчас выключена на сервере.';
  }
  return raw;
}

function environmentLabel(value: EnvironmentType): string {
  switch (value) {
    case 'SEED_START':
      return 'Проращивание семян';
    case 'OUTDOOR_ORNAMENTAL':
      return 'Уличное декоративное';
    case 'OUTDOOR_GARDEN':
      return 'Уличное садовое';
    case 'INDOOR':
    default:
      return 'Домашнее растение';
  }
}

function categoryLabel(value: PlantCategory): string {
  switch (value) {
    case 'SEED_START':
      return 'Семена';
    case 'OUTDOOR_DECORATIVE':
      return 'Декор';
    case 'OUTDOOR_GARDEN':
      return 'Сад';
    case 'HOME':
    default:
      return 'Дом';
  }
}

function categoryToEnvironment(category: PlantCategory): EnvironmentType {
  switch (category) {
    case 'OUTDOOR_DECORATIVE':
      return 'OUTDOOR_ORNAMENTAL';
    case 'OUTDOOR_GARDEN':
      return 'OUTDOOR_GARDEN';
    case 'SEED_START':
      return 'SEED_START';
    case 'HOME':
    default:
      return 'INDOOR';
  }
}

export function WizardAddPlant() {
  const prefersReducedMotion = useReducedMotion();
  const actionThrottleRef = useRef<Record<string, number>>({});
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const telegramUserId = useAuthStore((s) => s.telegramUserId);
  const authCity = useAuthStore((s) => s.city);

  const [stepIndex, setStepIndex] = useState(0);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);

  const [environmentType, setEnvironmentType] = useState<EnvironmentType>('INDOOR');
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [presets, setPresets] = useState<PlantPresetSuggestionDto[]>([]);
  const [lastSearchHadResults, setLastSearchHadResults] = useState(true);
  const [aiSearchSuggestions, setAiSearchSuggestions] = useState<PlantAiSearchSuggestionDto[]>([]);
  const [aiSearchSource, setAiSearchSource] = useState<PlantAiSearchResponseDto['source'] | null>(null);
  const [aiSearchError, setAiSearchError] = useState<string | null>(null);
  const [selectedAiSuggestion, setSelectedAiSuggestion] = useState<PlantAiSearchSuggestionDto | null>(null);

  const [plantType, setPlantType] = useState<PlantType>('DEFAULT');
  const [baseIntervalDays, setBaseIntervalDays] = useState('7');
  const [potVolumeLiters, setPotVolumeLiters] = useState('2');
  const [wateringAreaM2, setWateringAreaM2] = useState('0.5');
  const [containerType, setContainerType] = useState<ContainerType>('POT');
  const [growthStage, setGrowthStage] = useState<GrowthStage>('VEGETATIVE');
  const [greenhouse, setGreenhouse] = useState(false);
  const [soilType, setSoilType] = useState<SoilType>('LOAMY');
  const [sunExposure, setSunExposure] = useState<SunExposure>('PARTIAL_SHADE');
  const [seedStage, setSeedStage] = useState<SeedStage>('SOWN');
  const [targetEnvironmentType, setTargetEnvironmentType] = useState<Exclude<EnvironmentType, 'SEED_START'>>('INDOOR');
  const [seedContainerType, setSeedContainerType] = useState<SeedContainerType>('CELL_TRAY');
  const [seedSubstrateType, setSeedSubstrateType] = useState<SeedSubstrateType>('SEED_START_MIX');
  const [sowingDate, setSowingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [underCover, setUnderCover] = useState(true);
  const [growLight, setGrowLight] = useState(false);
  const [germinationTemperatureC, setGerminationTemperatureC] = useState('23');
  const [region, setRegion] = useState(authCity ?? '');
  const [mulched, setMulched] = useState(false);
  const [dripIrrigation, setDripIrrigation] = useState(false);
  const [haRoomId, setHaRoomId] = useState('');
  const [haRoomName, setHaRoomName] = useState('');
  const [temperatureSensorEntityId, setTemperatureSensorEntityId] = useState('');
  const [humiditySensorEntityId, setHumiditySensorEntityId] = useState('');
  const [soilMoistureSensorEntityId, setSoilMoistureSensorEntityId] = useState('');
  const [illuminanceSensorEntityId, setIlluminanceSensorEntityId] = useState('');
  const [haContextPreview, setHaContextPreview] = useState<WateringSensorContextDto | null>(null);
  const [weatherContextPreview, setWeatherContextPreview] = useState<WeatherContextPreviewDto | null>(null);

  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiRecommendation, setAiRecommendation] = useState<WizardRecommendation | null>(null);
  const [seedRecommendation, setSeedRecommendation] = useState<SeedWizardRecommendation | null>(null);
  const [latestRecommendationPreview, setLatestRecommendationPreview] = useState<WateringRecommendationPreviewDto | null>(null);
  const [latestSeedRecommendationPreview, setLatestSeedRecommendationPreview] = useState<SeedRecommendationPreviewDto | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [appliedRecommendationSource, setAppliedRecommendationSource] = useState<AppliedRecommendationSource>('none');
  const [manualOverrideEnabled, setManualOverrideEnabled] = useState(false);
  const [manualIntervalInput, setManualIntervalInput] = useState('7');
  const [manualWaterInput, setManualWaterInput] = useState('260');

  const [finalIntervalDays, setFinalIntervalDays] = useState(7);
  const [finalWaterMl, setFinalWaterMl] = useState(260);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const currentStep = STEPS[stepIndex]?.key ?? 'environment';
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const currentStepTitle = wizardStepTitle(currentStep, environmentType);
  const category = mapEnvironmentToCategory(environmentType);

  const intervalDaysNumber = clamp(Number(baseIntervalDays) || 7, 1, 60);
  const potLitersNumber = Math.max(0.2, Number(potVolumeLiters) || 2);
  const wateringAreaM2Number = Math.max(0.05, Number(wateringAreaM2) || 0.5);
  const germinationTemperatureNumber = clamp(Number(germinationTemperatureC) || 23, 10, 35);

  useEffect(() => {
    if (aiState === 'idle') {
      setFinalIntervalDays(intervalDaysNumber);
      setFinalWaterMl(estimateDefaultWaterMl(environmentType, potLitersNumber, wateringAreaM2Number));
    }
  }, [aiState, intervalDaysNumber, environmentType, potLitersNumber, wateringAreaM2Number]);

  useEffect(() => {
    if (environmentType === 'INDOOR') {
      setWeatherContextPreview(null);
    }
  }, [environmentType]);

  useEffect(() => {
    setManualIntervalInput(String(finalIntervalDays));
    setManualWaterInput(String(finalWaterMl));
  }, [finalIntervalDays, finalWaterMl]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const visualViewport = window.visualViewport;
    const updateKeyboardState = () => {
      const heightDelta = window.innerHeight - visualViewport.height;
      const likelyKeyboard = heightDelta > 120;
      const inset = likelyKeyboard
        ? Math.max(0, window.innerHeight - (visualViewport.height + visualViewport.offsetTop))
        : 0;
      setKeyboardVisible(likelyKeyboard);
      setKeyboardInset(inset);
    };

    updateKeyboardState();
    visualViewport.addEventListener('resize', updateKeyboardState);
    visualViewport.addEventListener('scroll', updateKeyboardState);
    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardState);
      visualViewport.removeEventListener('scroll', updateKeyboardState);
    };
  }, []);

  const suggestProfileMutation = useMutation({
    mutationFn: (plantName: string) => suggestPlantProfile(plantName),
    onSuccess: (result) => {
      if (result.intervalDays > 0) {
        const next = clamp(result.intervalDays, 1, 60);
        setBaseIntervalDays(String(next));
        if (aiState === 'idle') {
          setFinalIntervalDays(next);
        }
      }
      if (result.type && PLANT_TYPE_OPTIONS.some((option) => option.value === result.type)) {
        setPlantType(result.type as PlantType);
      }
    }
  });

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const [aiItems, localPlants, presetItems] = await Promise.all([
        aiSearchPlants({ query: q, category }),
        searchPlants(q, category),
        searchPlantPresets(category, q, 12)
      ]);
      return { aiItems, localPlants, presetItems };
    },
    onMutate: () => {
      setAiSearchError(null);
      setAiSearchSuggestions([]);
      setAiSearchSource(null);
    },
    onSuccess: ({ aiItems, localPlants, presetItems }) => {
      const merged = new Set<string>();
      localPlants.forEach((item) => merged.add(item.name));
      presetItems.forEach((item) => merged.add(item.name));
      setHints(Array.from(merged).slice(0, 8));
      setPresets(presetItems);
      setAiSearchSuggestions(aiItems.suggestions ?? []);
      setAiSearchSource(aiItems.source ?? null);
      setLastSearchHadResults(
        merged.size > 0 || presetItems.length > 0 || (aiItems.suggestions?.length ?? 0) > 0
      );
    },
    onError: (error) => {
      setAiSearchSuggestions([]);
      setAiSearchSource(null);
      setAiSearchError(error instanceof Error ? error.message : 'Не удалось получить варианты от AI.');
      setLastSearchHadResults(false);
    }
  });

  const haOptionsQuery = useQuery({
    queryKey: ['wizard-ha-options'],
    queryFn: getWateringHaOptions,
    staleTime: 30_000
  });

  const aiRecommendMutation = useMutation({
    mutationFn: () => previewWateringRecommendation({
      plantName: name.trim(),
      environmentType: environmentType === 'SEED_START' ? 'INDOOR' : environmentType,
      baseIntervalDays: intervalDaysNumber,
      potVolumeLiters: environmentType === 'INDOOR' ? potLitersNumber : undefined,
      containerType: environmentType === 'INDOOR' ? undefined : containerType,
      containerVolume: environmentType === 'OUTDOOR_ORNAMENTAL' && isOutdoorOrnamentalContainerMode(containerType) ? potLitersNumber : undefined,
      growthStage: environmentType === 'OUTDOOR_GARDEN' ? growthStage : undefined,
      greenhouse: environmentType === 'OUTDOOR_GARDEN' ? greenhouse : undefined,
      soilType,
      sunExposure,
      cropType: environmentType === 'OUTDOOR_GARDEN' ? name.trim() : undefined,
      mulched: environmentType === 'OUTDOOR_GARDEN' ? mulched : undefined,
      dripIrrigation: environmentType === 'OUTDOOR_GARDEN' ? dripIrrigation : undefined,
      outdoorAreaM2: environmentType === 'OUTDOOR_GARDEN' ? wateringAreaM2Number : undefined,
      haRoomId: haRoomId || undefined,
      haRoomName: haRoomName || undefined,
      temperatureSensorEntityId: temperatureSensorEntityId || undefined,
      humiditySensorEntityId: humiditySensorEntityId || undefined,
      soilMoistureSensorEntityId: soilMoistureSensorEntityId || undefined,
      illuminanceSensorEntityId: illuminanceSensorEntityId || undefined,
      city: region.trim() || undefined
    }),
    onMutate: () => {
      setAiState('loading');
      setAiErrorMessage(null);
      setAppliedRecommendationSource('none');
      setLatestRecommendationPreview(null);
      setLatestSeedRecommendationPreview(null);
      setSeedRecommendation(null);
    },
    onSuccess: (result) => {
      const appliedSource = mapPreviewSourceToApplied(result.source);
      const normalizedSource: WizardRecommendation['source'] =
        appliedSource === 'none' ? 'fallback' : appliedSource;
      const normalized: WizardRecommendation = {
        source: normalizedSource,
        recommendedIntervalDays: result.recommendedIntervalDays,
        recommendedWaterMl: result.recommendedWaterMl,
        summary: result.summary,
        reasoning: result.reasoning ?? [],
        warnings: result.warnings ?? [],
        profile: result.environmentType ?? environmentType
      };
      setHaContextPreview(result.sensorContext ?? null);
      setLatestRecommendationPreview(result);
      setAiRecommendation(normalized);
      const nextState = normalized.source === 'fallback' ? 'fallback' : 'success';
      setAiState(nextState);
      setManualOverrideEnabled(false);
      if (nextState === 'fallback') {
        hapticWarning();
      } else {
        hapticSuccess();
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Ошибка AI расчёта';
      setAiErrorMessage(message);
      setAiState('error');
      setAppliedRecommendationSource('none');
      setLatestRecommendationPreview(null);
      hapticError();
    }
  });

  const seedRecommendMutation = useMutation({
    mutationFn: () => previewSeedRecommendation({
      plantName: name.trim(),
      seedStage,
      targetEnvironmentType,
      seedContainerType,
      seedSubstrateType,
      sowingDate,
      germinationTemperatureC: germinationTemperatureNumber,
      underCover,
      growLight,
      region: region.trim() || undefined
    }),
    onMutate: () => {
      setAiState('loading');
      setAiErrorMessage(null);
      setAppliedRecommendationSource('none');
      setSeedRecommendation(null);
      setLatestSeedRecommendationPreview(null);
      setAiRecommendation(null);
      setLatestRecommendationPreview(null);
    },
    onSuccess: (result) => {
      const normalized: SeedWizardRecommendation = {
        source: result.source === 'AI' ? 'ai' : 'fallback',
        seedStage: result.seedStage,
        targetEnvironmentType: result.targetEnvironmentType as Exclude<EnvironmentType, 'SEED_START'>,
        careMode: result.careMode,
        recommendedCheckIntervalHours: result.recommendedCheckIntervalHours,
        recommendedWateringMode: result.recommendedWateringMode,
        expectedGerminationDaysMin: result.expectedGerminationDaysMin,
        expectedGerminationDaysMax: result.expectedGerminationDaysMax,
        summary: result.summary,
        reasoning: result.reasoning ?? [],
        warnings: result.warnings ?? []
      };
      setSeedRecommendation(normalized);
      setLatestSeedRecommendationPreview(result);
      setAiState(normalized.source === 'fallback' ? 'fallback' : 'success');
      if (normalized.source === 'fallback') {
        hapticWarning();
      } else {
        hapticSuccess();
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Ошибка AI-расчёта для семян';
      setAiErrorMessage(message);
      setAiState('error');
      setSeedRecommendation(null);
      setLatestSeedRecommendationPreview(null);
      hapticError();
    }
  });

  const haContextPreviewMutation = useMutation({
    mutationFn: () => previewWateringHaContext({
      plantName: name.trim(),
      environmentType: environmentType === 'SEED_START' ? 'INDOOR' : environmentType,
      haRoomId: haRoomId || undefined,
      haRoomName: haRoomName || undefined,
      temperatureSensorEntityId: temperatureSensorEntityId || undefined,
      humiditySensorEntityId: humiditySensorEntityId || undefined,
      soilMoistureSensorEntityId: soilMoistureSensorEntityId || undefined,
      illuminanceSensorEntityId: illuminanceSensorEntityId || undefined
    }),
    onSuccess: (result) => {
      setHaContextPreview(result);
      if (result.available) {
        hapticSuccess();
      } else {
        hapticWarning();
      }
    },
    onError: () => {
      setHaContextPreview(null);
      hapticError();
    }
  });

  const weatherPreviewMutation = useMutation({
    mutationFn: () => apiFetch<WeatherContextPreviewDto>('/api/watering/recommendation/weather/preview', {
      method: 'POST',
      body: JSON.stringify({
        plantName: name.trim(),
        environmentType,
        city: region.trim() || undefined
      })
    }),
    onSuccess: (result) => {
      setWeatherContextPreview(result);
      if (result.available) {
        hapticSuccess();
      } else {
        hapticWarning();
      }
    },
    onError: () => {
      setWeatherContextPreview(null);
      hapticError();
    }
  });

  const shouldThrottleAction = (key: string, cooldownMs: number) => {
    const now = Date.now();
    const lastAt = actionThrottleRef.current[key] ?? 0;
    if (now - lastAt < cooldownMs) {
      return true;
    }
    actionThrottleRef.current[key] = now;
    return false;
  };

  const maybeEnablePushOnFirstPlant = async (hadPlantsBeforeCreate: boolean) => {
    if (hadPlantsBeforeCreate) {
      return;
    }

    const promptKey = `plantbot.push.prompted.${telegramUserId ?? 'anonymous'}`;
    if (localStorage.getItem(promptKey) === '1') {
      return;
    }

    try {
      const keyData = await getPwaPushPublicKey();
      if (!keyData.enabled || !keyData.publicKey) {
        return;
      }
      const subscription = await ensurePushSubscription(keyData.publicKey);
      if (!subscription) {
        return;
      }
      const status = await getPwaPushStatus(subscription.endpoint);
      if (status.currentDeviceSubscribed) {
        localStorage.setItem(promptKey, '1');
        return;
      }
      await subscribePwaPush(subscription.toJSON());
      localStorage.setItem(promptKey, '1');
    } catch {
      // Пользователь может включить push позже в настройках.
    }
  };

  const createMutation = useMutation({
    mutationFn: () => {
      setCreateErrorMessage(null);
      if (environmentType === 'SEED_START') {
        return createPlant({
          name: name.trim(),
          category,
          environmentType,
          wateringProfile: environmentType,
          placement: 'INDOOR',
          type: 'DEFAULT',
          city: region.trim() || null,
          region: region.trim() || null,
          potVolumeLiters: 1,
          baseIntervalDays: 1,
          preferredWaterMl: 80,
          recommendationSource: null,
          recommendationSummary: null,
          recommendationReasoningJson: null,
          recommendationWarningsJson: null,
          confidenceScore: null,
          seedStage,
          targetEnvironmentType,
          seedContainerType,
          seedSubstrateType,
          sowingDate,
          underCover,
          growLight,
          germinationTemperatureC: germinationTemperatureNumber,
          expectedGerminationDaysMin: latestSeedRecommendationPreview?.expectedGerminationDaysMin ?? seedRecommendation?.expectedGerminationDaysMin ?? null,
          expectedGerminationDaysMax: latestSeedRecommendationPreview?.expectedGerminationDaysMax ?? seedRecommendation?.expectedGerminationDaysMax ?? null,
          recommendedCheckIntervalHours: latestSeedRecommendationPreview?.recommendedCheckIntervalHours ?? seedRecommendation?.recommendedCheckIntervalHours ?? null,
          recommendedWateringMode: latestSeedRecommendationPreview?.recommendedWateringMode ?? seedRecommendation?.recommendedWateringMode ?? null,
          seedCareMode: seedRecommendation?.careMode ?? null,
          seedSummary: seedRecommendation?.summary ?? null,
          seedReasoningJson: JSON.stringify(seedRecommendation?.reasoning ?? []),
          seedWarningsJson: JSON.stringify(seedRecommendation?.warnings ?? []),
          seedCareSource: latestSeedRecommendationPreview?.source ?? (seedRecommendation?.source === 'ai' ? 'AI' : seedRecommendation?.source === 'fallback' ? 'FALLBACK' : null)
        });
      }

      const placement = environmentType === 'INDOOR' ? 'INDOOR' : 'OUTDOOR';
      const outdoorAreaM2 = environmentType === 'OUTDOOR_GARDEN'
        ? wateringAreaM2Number
        : null;
      const shouldUsePot = environmentType === 'INDOOR'
        || (environmentType === 'OUTDOOR_ORNAMENTAL' && isOutdoorOrnamentalContainerMode(containerType));

      return createPlant({
        name: name.trim(),
        category,
        environmentType,
        wateringProfile: environmentType,
        placement,
        recommendationSource: mapAppliedSourceToBackend(appliedRecommendationSource),
        recommendationSummary: aiRecommendation?.summary ?? null,
        recommendationReasoningJson: JSON.stringify(aiRecommendation?.reasoning ?? []),
        recommendationWarningsJson: JSON.stringify(aiRecommendation?.warnings ?? []),
        confidenceScore: latestRecommendationPreview?.confidence ?? null,
        type: plantType,
        city: region.trim() || null,
        region: region.trim() || null,
        containerType: environmentType === 'INDOOR'
          ? 'POT'
          : environmentType === 'OUTDOOR_GARDEN'
            ? containerType
            : containerType,
        containerVolumeLiters: environmentType === 'OUTDOOR_ORNAMENTAL' && isOutdoorOrnamentalContainerMode(containerType)
          ? potLitersNumber
          : null,
        cropType: environmentType === 'OUTDOOR_GARDEN' ? name.trim() : null,
        growthStage: environmentType === 'OUTDOOR_GARDEN' ? growthStage : null,
        greenhouse: environmentType === 'OUTDOOR_GARDEN' ? greenhouse : null,
        dripIrrigation: environmentType === 'OUTDOOR_GARDEN' ? dripIrrigation : null,
        baseIntervalDays: finalIntervalDays,
        preferredWaterMl: finalWaterMl,
        potVolumeLiters: environmentType === 'OUTDOOR_GARDEN' ? 1 : shouldUsePot ? potLitersNumber : 1,
        outdoorAreaM2,
        outdoorSoilType: placement === 'OUTDOOR' ? soilType : null,
        sunExposure: placement === 'OUTDOOR' ? sunExposure : null,
        mulched: placement === 'OUTDOOR' ? mulched : null,
        perennial: placement === 'OUTDOOR' ? environmentType !== 'OUTDOOR_GARDEN' : null,
        winterDormancyEnabled: placement === 'OUTDOOR' ? environmentType !== 'OUTDOOR_GARDEN' : null
      });
    },
    onSuccess: async (createdPlant) => {
      const hadPlantsBeforeCreate = ((queryClient.getQueryData(['plants']) as PlantDto[] | undefined) ?? []).length > 0;
      setCreateErrorMessage(null);
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void maybeEnablePushOnFirstPlant(hadPlantsBeforeCreate);
      setActiveTab('home');
      openPlantDetail(createdPlant.id);
    },
    onError: (error) => {
      setCreateErrorMessage(error instanceof Error ? error.message : 'Не удалось создать растение.');
      hapticError();
    }
  });

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setHints([]);
      setPresets([]);
      setAiSearchSuggestions([]);
      setAiSearchSource(null);
      setAiSearchError(null);
      setSelectedAiSuggestion(null);
      setLastSearchHadResults(true);
      return;
    }
  }, [searchQuery, category]);

  useEffect(() => {
    if (!haRoomId || !haOptionsQuery.data?.rooms?.length) {
      return;
    }
    const room = haOptionsQuery.data.rooms.find((item) => item.id === haRoomId);
    setHaRoomName(room?.name ?? '');
  }, [haRoomId, haOptionsQuery.data?.rooms]);

  const applyIdentify = (result: OpenRouterIdentifyResult) => {
    const nextName = result.russianName?.trim() || result.latinName?.trim() || '';
    if (nextName) {
      setName(nextName);
      setSearchQuery(nextName);
      if (!suggestProfileMutation.isPending) {
        suggestProfileMutation.mutate(nextName);
      }
    }
    if (result.wateringIntervalDays > 0) {
      setBaseIntervalDays(String(clamp(result.wateringIntervalDays, 1, 60)));
    }
  };

  const reviewDates = useMemo(() => {
    const shouldUsePreviewCycle = (appliedRecommendationSource === 'ai' || appliedRecommendationSource === 'fallback')
      && latestRecommendationPreview?.cyclePreview?.dates?.length;
    if (shouldUsePreviewCycle) {
      return (latestRecommendationPreview?.cyclePreview?.dates ?? []).slice(0, 6).map((date) => {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) {
          return date;
        }
        return formatRuDate(parsed);
      });
    }
    return buildCycleDates(finalIntervalDays).map((date) => formatRuDate(date));
  }, [appliedRecommendationSource, latestRecommendationPreview, finalIntervalDays]);

  const canGoNext = useMemo(() => {
    if (currentStep === 'environment') {
      return true;
    }
    if (currentStep === 'identify') {
      return name.trim().length > 1;
    }
    if (currentStep === 'conditions') {
      if (environmentType === 'SEED_START') {
        return !!name.trim() && !!sowingDate && !!targetEnvironmentType;
      }
      if (environmentType === 'INDOOR') {
        return potLitersNumber > 0 && intervalDaysNumber > 0;
      }
      if (environmentType === 'OUTDOOR_ORNAMENTAL') {
        const needsVolume = isOutdoorOrnamentalContainerMode(containerType);
        return intervalDaysNumber > 0 && (!needsVolume || potLitersNumber > 0);
      }
      return intervalDaysNumber > 0 && wateringAreaM2Number > 0;
    }
    if (currentStep === 'ai') {
      return appliedRecommendationSource !== 'none';
    }
    return false;
  }, [
    currentStep,
    name,
    environmentType,
    sowingDate,
    targetEnvironmentType,
    potLitersNumber,
    intervalDaysNumber,
    containerType,
    wateringAreaM2Number,
    appliedRecommendationSource
  ]);

  const isRecommendationLoading = environmentType === 'SEED_START'
    ? seedRecommendMutation.isPending
    : aiRecommendMutation.isPending;
  const isWizardActionBusy = createMutation.isPending
    || searchMutation.isPending
    || suggestProfileMutation.isPending
    || aiRecommendMutation.isPending
    || seedRecommendMutation.isPending
    || haContextPreviewMutation.isPending
    || weatherPreviewMutation.isPending;

  const goNext = () => {
    if (!canGoNext || createMutation.isPending) {
      return;
    }
    impactLight();
    setStepDirection(1);
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (createMutation.isPending) {
      return;
    }
    impactLight();
    setStepDirection(-1);
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const nextStepKey = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]?.key ?? currentStep;
  const nextStepTitle = wizardStepTitle(nextStepKey, environmentType);
  const sectionBottomPadding = keyboardVisible
    ? `calc(env(safe-area-inset-bottom) + 10rem + ${keyboardInset}px)`
    : 'calc(env(safe-area-inset-bottom) + 7.5rem)';
  const footerStyle = keyboardVisible
    ? {
      transform: `translateY(-${keyboardInset}px)`,
      transition: prefersReducedMotion ? undefined : 'transform 180ms ease-out'
    }
    : {
      transition: prefersReducedMotion ? undefined : 'transform 180ms ease-out'
    };

  return (
    <section className="space-y-5" style={{ paddingBottom: sectionBottomPadding }}>
      <div className="ios-blur-card overflow-hidden p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-ios-subtext">Шаг {stepIndex + 1} из {STEPS.length}</p>
            <p className="mt-1 text-[clamp(1.2rem,4.9vw,1.5rem)] font-semibold leading-tight text-ios-text">{currentStepTitle}</p>
          </div>
          <span className="theme-surface-subtle rounded-full border px-2.5 py-1 text-[11px] text-ios-subtext">
            Далее: {nextStepTitle}
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ios-border/35">
          <motion.div
            className="h-full rounded-full bg-ios-accent"
            animate={{ width: `${progress}%` }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
          />
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {STEPS.map((step, idx) => (
            <div
              key={step.key}
              className={cn(
                'h-1.5 rounded-full transition-colors duration-200',
                idx <= stepIndex ? 'bg-ios-accent/80' : 'bg-ios-border/45'
              )}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: stepDirection === 1 ? 20 : -20, y: 6, scale: 0.995 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: stepDirection === 1 ? -20 : 20, y: 4, scale: 0.995 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="space-y-4"
        >
          {currentStep === 'environment' ? (
            <div className="grid grid-cols-1 gap-3">
              {(Object.keys(ENVIRONMENT_META) as EnvironmentType[]).map((key) => {
                const meta = ENVIRONMENT_META[key];
                const Icon = meta.icon;
                const active = environmentType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      'ios-blur-card relative overflow-hidden rounded-ios-card border p-4 text-left',
                      active
                        ? 'border-ios-accent/70 bg-ios-accent/10 shadow-ios'
                        : 'theme-surface-2 hover:border-ios-accent/35'
                    )}
                    onClick={() => {
                      selection();
                      setEnvironmentType(key);
                      setSelectedAiSuggestion(null);
                      setAiState('idle');
                      setAiRecommendation(null);
                      setAppliedRecommendationSource('none');
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('rounded-full p-3', active ? 'bg-ios-accent/20 text-ios-accent' : 'bg-ios-border/40 text-ios-subtext')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-ios-body font-semibold text-ios-text">{meta.title}</p>
                        <p className="mt-1 text-ios-caption text-ios-subtext">{meta.subtitle}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {currentStep === 'identify' ? (
            <>
              <div className="ios-blur-card p-4 sm:p-5">
                <label className="mb-1 block text-ios-caption text-ios-subtext">Введите название растения</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-subtext" />
                    <input
                      value={searchQuery}
                      onChange={(event) => {
                        setSelectedAiSuggestion(null);
                        setSearchQuery(event.target.value);
                        setName(event.target.value);
                      }}
                      placeholder="Например: Фикус, Роза, Томат"
                      className="theme-field h-11 w-full rounded-ios-button border pl-9 pr-3 text-base outline-none"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="h-11"
                    disabled={searchMutation.isPending || !searchQuery.trim()}
                    onClick={() => {
                      if (shouldThrottleAction('ai-search', 600)) {
                        return;
                      }
                      searchMutation.mutate(searchQuery.trim());
                    }}
                  >
                    {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
                  </Button>
                </div>

                {searchMutation.isPending ? (
                  <StatusCard
                    tone="neutral"
                    title="Ищем подходящие растения..."
                    description="AI подбирает наиболее вероятные варианты и ограничивает список лучшими совпадениями."
                  />
                ) : null}

                {!searchMutation.isPending && aiSearchSuggestions.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ios-text">Варианты от поиска</p>
                      <span className="theme-surface-subtle rounded-full border px-2.5 py-1 text-[11px] text-ios-subtext">
                        {aiSearchSource === 'AI' ? 'AI' : 'Резервный список'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {aiSearchSuggestions.slice(0, 10).map((item) => (
                        <button
                          key={`${item.category}:${item.name}:${item.hint ?? ''}`}
                          type="button"
                          className="theme-surface-2 w-full rounded-ios-button border p-3 text-left transition-colors hover:border-ios-accent/40"
                          onClick={() => {
                            selection();
                            setSelectedAiSuggestion(item);
                            setName(item.name);
                            setSearchQuery(item.name);
                            if (item.type && PLANT_TYPE_OPTIONS.some((option) => option.value === item.type)) {
                              setPlantType(item.type as PlantType);
                            }
                            if (!suggestProfileMutation.isPending) {
                              suggestProfileMutation.mutate(item.name);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ios-text">{item.name}</p>
                              {item.hint ? (
                                <p className="mt-1 line-clamp-2 text-xs text-ios-subtext">{item.hint}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="theme-surface-subtle rounded-full border px-2 py-0.5 text-[11px] text-ios-subtext">
                                {categoryHintLabel(item.category)}
                              </span>
                              <span className="theme-surface-subtle rounded-full border px-2 py-0.5 text-[11px] text-ios-subtext">
                                {normalizeRecommendationText(item.type)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!searchMutation.isPending && searchQuery.trim() && aiSearchError ? (
                  <StatusCard
                    tone="danger"
                    title="Не удалось получить варианты"
                    description="Проверьте сеть и попробуйте снова. Можно продолжить вручную или использовать фото-определение."
                  />
                ) : null}

                {searchQuery.trim() && !searchMutation.isPending && !lastSearchHadResults && !aiSearchError ? (
                  <p className="theme-surface-2 mt-3 rounded-ios-button border p-3 text-sm text-ios-subtext">
                    Подходящие варианты не найдены. Попробуйте другое название или используйте AI-определение по фото.
                  </p>
                ) : null}

                {selectedAiSuggestion ? (
                  <div className="theme-surface-2 mt-3 rounded-ios-button border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ios-text">Выбран вариант: {selectedAiSuggestion.name}</p>
                        <p className="mt-1 text-xs text-ios-subtext">
                          {selectedAiSuggestion.hint?.trim() || 'Название подставлено в wizard и готово для следующего шага.'}
                        </p>
                      </div>
                      <span className="theme-surface-subtle rounded-full border px-2 py-0.5 text-[11px] text-ios-subtext">
                        {categoryHintLabel(selectedAiSuggestion.category)}
                      </span>
                    </div>

                    {selectedAiSuggestion.category !== category ? (
                      <div className="mt-3 space-y-2">
                        <StatusCard
                          tone="neutral"
                          title={`AI относит вариант ближе к категории «${categoryHintLabel(selectedAiSuggestion.category)}»`}
                          description={`Сейчас wizard остаётся в режиме «${categoryLabel(category)}». Можно продолжить как есть или вручную переключить flow.`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="secondary"
                            className="h-10"
                            onClick={() => setSelectedAiSuggestion(null)}
                          >
                            Оставить текущий flow
                          </Button>
                          <Button
                            variant="secondary"
                            className="h-10"
                            onClick={() => {
                              selection();
                              setEnvironmentType(categoryToEnvironment(selectedAiSuggestion.category));
                            }}
                          >
                            Переключить flow
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {presets.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {presets.map((item) => (
                      <button
                        key={`${item.category}:${item.name}`}
                        type="button"
                        className="theme-surface-subtle rounded-full border px-3 py-1.5 text-xs"
                        onClick={() => {
                          selection();
                          setSelectedAiSuggestion(null);
                          setName(item.name);
                          setSearchQuery(item.name);
                          suggestProfileMutation.mutate(item.name);
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                {hints.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hints.map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        className="rounded-full border border-ios-border/60 bg-transparent px-2.5 py-1 text-xs"
                        onClick={() => {
                          selection();
                          setSelectedAiSuggestion(null);
                          setName(hint);
                          setSearchQuery(hint);
                        }}
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <PlantPhotoCapture onIdentified={applyIdentify} />

              {name.trim() ? (
                <div className="ios-blur-card rounded-ios-card border border-ios-accent/40 bg-ios-accent/10 p-3 text-sm">
                  Выбрано: <b>{name.trim()}</b>
                </div>
              ) : null}
            </>
          ) : null}

          {currentStep === 'conditions' ? (
            <div className="ios-blur-card space-y-4 p-4 sm:p-5">
              {environmentType !== 'SEED_START' ? (
                <Field label="Базовый интервал полива (дней)">
                  <input
                    type="number"
                    min={1}
                    value={baseIntervalDays}
                    onChange={(event) => setBaseIntervalDays(event.target.value)}
                    className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                  />
                </Field>
              ) : null}

              <Field label={environmentType === 'INDOOR' || environmentType === 'SEED_START' ? 'Регион / город' : 'Город / населённый пункт'}>
                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder={environmentType === 'INDOOR' || environmentType === 'SEED_START'
                    ? 'Например: Санкт-Петербург'
                    : 'Например: Санкт-Петербург, Пушкин, Гатчина'}
                  className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                />
              </Field>

              {environmentType === 'SEED_START' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Стадия">
                      <select
                        value={seedStage}
                        onChange={(event) => setSeedStage(event.target.value as SeedStage)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        {SEED_STAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Цель после проращивания">
                      <select
                        value={targetEnvironmentType}
                        onChange={(event) => setTargetEnvironmentType(event.target.value as Exclude<EnvironmentType, 'SEED_START'>)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        <option value="INDOOR">Домашнее растение</option>
                        <option value="OUTDOOR_ORNAMENTAL">Уличное декоративное</option>
                        <option value="OUTDOOR_GARDEN">Уличное садовое</option>
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Тип ёмкости">
                      <select
                        value={seedContainerType}
                        onChange={(event) => setSeedContainerType(event.target.value as SeedContainerType)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        {SEED_CONTAINER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Субстрат">
                      <select
                        value={seedSubstrateType}
                        onChange={(event) => setSeedSubstrateType(event.target.value as SeedSubstrateType)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        {SEED_SUBSTRATE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Дата посева">
                      <input
                        type="date"
                        value={sowingDate}
                        onChange={(event) => setSowingDate(event.target.value)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                    <Field label="Температура проращивания (°C)">
                      <input
                        type="number"
                        min={10}
                        max={35}
                        step={0.5}
                        value={germinationTemperatureC}
                        onChange={(event) => setGerminationTemperatureC(event.target.value)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ToggleRow label="Под укрытием / крышкой" checked={underCover} onChange={setUnderCover} />
                    <ToggleRow label="Есть досветка" checked={growLight} onChange={setGrowLight} />
                  </div>
                </>
              ) : null}

              {environmentType === 'INDOOR' ? (
                <>
                  <Field label="Объём горшка (л)">
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={potVolumeLiters}
                      onChange={(event) => setPotVolumeLiters(event.target.value)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    />
                  </Field>
                  <Field label="Тип растения">
                    <select
                      value={plantType}
                      onChange={(event) => setPlantType(event.target.value as PlantType)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    >
                      {PLANT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : null}

              {environmentType === 'OUTDOOR_ORNAMENTAL' ? (
                <>
                  <div className="theme-surface-2 rounded-ios-button border p-3 text-sm text-ios-subtext">
                    Декоративный outdoor-flow собирает только то, что влияет на пересыхание субстрата и режим ухода: формат выращивания, город, солнце, почву и базовый ритм полива.
                  </div>

                  <Field label="Формат выращивания">
                    <select
                      value={containerType}
                      onChange={(event) => setContainerType(event.target.value as ContainerType)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    >
                      <option value="POT">Кашпо</option>
                      <option value="CONTAINER">Контейнер</option>
                      <option value="FLOWERBED">Клумба</option>
                      <option value="OPEN_GROUND">Открытый грунт</option>
                    </select>
                  </Field>

                  {isOutdoorOrnamentalContainerMode(containerType) ? (
                    <Field label="Объём контейнера (л)">
                      <input
                        type="number"
                        min={0.2}
                        step={0.1}
                        value={potVolumeLiters}
                        onChange={(event) => setPotVolumeLiters(event.target.value)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              {environmentType === 'OUTDOOR_ORNAMENTAL' || environmentType === 'OUTDOOR_GARDEN' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Освещённость">
                      <select
                        value={sunExposure}
                        onChange={(event) => setSunExposure(event.target.value as SunExposure)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        {SUN_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Почва">
                      <select
                        value={soilType}
                        onChange={(event) => setSoilType(event.target.value as SoilType)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      >
                        {SOIL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="theme-surface-2 rounded-ios-button border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ios-text">Погодный контекст</p>
                        <p className="text-xs text-ios-subtext">Прогноз учитывается для outdoor рекомендаций.</p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9"
                        disabled={weatherPreviewMutation.isPending || !name.trim()}
                        onClick={() => {
                          if (shouldThrottleAction('weather-preview', 1200)) return;
                          weatherPreviewMutation.mutate();
                        }}
                      >
                        {weatherPreviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Проверить'}
                      </Button>
                    </div>

                    {weatherContextPreview ? (
                      <div className="mt-2 space-y-2">
                        <StatusCard
                          tone={weatherContextPreview.available ? 'neutral' : 'danger'}
                          title={weatherContextPreview.available
                            ? `Погода доступна: ${weatherContextPreview.city || region || 'город не указан'}`
                            : 'Погодный контекст недоступен'}
                          description={weatherContextPreview.available
                            ? `Уверенность: ${weatherContextPreview.confidence || 'н/д'}`
                            : 'Будет использован резервный режим без погодных корректировок.'}
                        />
                        {weatherContextPreview.available ? (
                          <div className="grid grid-cols-2 gap-2 text-xs text-ios-subtext">
                            <div className="theme-surface-subtle rounded-ios-button border p-2">
                              Сейчас: <b>{weatherContextPreview.temperatureNowC ?? '—'}°C</b>
                            </div>
                            <div className="theme-surface-subtle rounded-ios-button border p-2">
                              Влажность: <b>{weatherContextPreview.humidityNowPercent ?? '—'}%</b>
                            </div>
                            <div className="theme-surface-subtle rounded-ios-button border p-2">
                              Осадки 24ч: <b>{weatherContextPreview.precipitationLast24hMm ?? '—'} мм</b>
                            </div>
                            <div className="theme-surface-subtle rounded-ios-button border p-2">
                              Осадки прогноз: <b>{weatherContextPreview.precipitationForecastMm ?? '—'} мм</b>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {environmentType === 'OUTDOOR_GARDEN' ? (
                <>
                  <div className="theme-surface-2 rounded-ios-button border p-3 text-sm text-ios-subtext">
                    Садовый flow собирает агрономические поля: где растёт культура, на какой стадии она сейчас, есть ли теплица, мульча, капельный полив и какая зона полива нужна растению.
                  </div>

                  <Field label="Где выращивается">
                    <select
                      value={containerType}
                      onChange={(event) => setContainerType(event.target.value as ContainerType)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    >
                      <option value="OPEN_GROUND">Открытый грунт</option>
                      <option value="FLOWERBED">Грядка</option>
                      <option value="CONTAINER">Контейнерная грядка</option>
                    </select>
                  </Field>

                  <Field label="Стадия роста">
                    <select
                      value={growthStage}
                      onChange={(event) => setGrowthStage(event.target.value as GrowthStage)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    >
                      {GROWTH_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Зона полива / площадь ухода (м²)">
                    <input
                      type="number"
                      min={0.05}
                      step={0.05}
                      value={wateringAreaM2}
                      onChange={(event) => setWateringAreaM2(event.target.value)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    />
                  </Field>

                  <p className="text-xs text-ios-subtext">
                    Укажите примерную площадь, которую реально проливаете вокруг культуры. Это заменяет разрозненные поля высоты и диаметра.
                  </p>

                  <ToggleRow label="Теплица" checked={greenhouse} onChange={setGreenhouse} />
                  <ToggleRow label="Мульча" checked={mulched} onChange={setMulched} />
                  <ToggleRow label="Капельный полив" checked={dripIrrigation} onChange={setDripIrrigation} />
                </>
              ) : null}

              <div className="theme-surface-2 rounded-ios-button border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ios-text">Home Assistant контекст (опционально)</p>
                    <p className="text-xs text-ios-subtext">Можно выбрать комнату и сенсоры для более точного расчёта.</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9"
                    onClick={() => haOptionsQuery.refetch()}
                    disabled={haOptionsQuery.isFetching}
                  >
                    {haOptionsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Обновить'}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  <Field label="Комната">
                    <select
                      value={haRoomId}
                      onChange={(event) => setHaRoomId(event.target.value)}
                      className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                    >
                      <option value="">Не выбрано (авто)</option>
                      {(haOptionsQuery.data?.rooms ?? []).map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SensorSelect
                      label="Температура"
                      value={temperatureSensorEntityId}
                      onChange={setTemperatureSensorEntityId}
                      sensors={filterSensorsByKind(haOptionsQuery.data?.sensors, 'TEMPERATURE', haRoomId)}
                    />
                    <SensorSelect
                      label="Влажность"
                      value={humiditySensorEntityId}
                      onChange={setHumiditySensorEntityId}
                      sensors={filterSensorsByKind(haOptionsQuery.data?.sensors, 'HUMIDITY', haRoomId)}
                    />
                    <SensorSelect
                      label="Влажность почвы"
                      value={soilMoistureSensorEntityId}
                      onChange={setSoilMoistureSensorEntityId}
                      sensors={filterSensorsByKind(haOptionsQuery.data?.sensors, 'SOIL_MOISTURE', haRoomId)}
                    />
                    <SensorSelect
                      label="Освещённость"
                      value={illuminanceSensorEntityId}
                      onChange={setIlluminanceSensorEntityId}
                      sensors={filterSensorsByKind(haOptionsQuery.data?.sensors, 'ILLUMINANCE', haRoomId)}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 w-full"
                    disabled={!name.trim() || haContextPreviewMutation.isPending}
                    onClick={() => {
                      if (shouldThrottleAction('ha-preview', 1200)) return;
                      haContextPreviewMutation.mutate();
                    }}
                  >
                    {haContextPreviewMutation.isPending ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Проверяем HA контекст…</span>
                    ) : 'Проверить HA контекст'}
                  </Button>

                  {haContextPreview ? (
                    <StatusCard
                      tone={haContextPreview.available ? 'neutral' : 'danger'}
                      title={haContextPreview.available ? 'HA контекст найден' : 'HA контекст недоступен'}
                      description={normalizeHaContextMessage(haContextPreview.message, haContextPreview.available)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 'ai' ? (
            <div className="ios-blur-card space-y-4 p-4 sm:p-5">
              <Button
                className="h-auto min-h-[44px] w-full whitespace-normal break-words px-3 py-2 text-center leading-tight"
                disabled={isRecommendationLoading || !name.trim()}
                onClick={() => {
                  if (shouldThrottleAction('ai-preview', 1200)) return;
                  if (environmentType === 'SEED_START') {
                    seedRecommendMutation.mutate();
                    return;
                  }
                  aiRecommendMutation.mutate();
                }}
              >
                {(environmentType === 'SEED_START' ? seedRecommendMutation.isPending : aiRecommendMutation.isPending) ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {environmentType === 'SEED_START' ? 'Рассчитываем рекомендации для семян...' : 'Рассчитываем рекомендации AI...'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {environmentType === 'SEED_START' ? 'Рассчитать рекомендации для семян' : 'Рассчитать рекомендации AI'}
                  </span>
                )}
              </Button>

              {aiState === 'idle' ? (
                  <StatusCard
                    tone="neutral"
                    title="Нажмите кнопку, чтобы получить AI расчёт."
                    description={environmentType === 'SEED_START'
                      ? 'AI учтёт стадию проращивания, условия старта и целевую категорию.'
                      : 'AI учтёт профиль растения, условия выращивания и погодный контекст.'}
                  />
                ) : null}

              {aiState === 'loading' ? (
                <motion.div
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <StatusCard
                    tone="neutral"
                    title="Выполняем расчёт..."
                    description={environmentType === 'SEED_START'
                      ? 'Получаем режим контроля влажности, окно всходов и интервалы проверки.'
                      : 'Получаем структурированные рекомендации по интервалу и объёму полива.'}
                  />
                </motion.div>
              ) : null}

              {environmentType !== 'SEED_START' && aiState === 'success' && aiRecommendation ? (
                <RecommendationCard
                  recommendation={aiRecommendation}
                  sensorContext={haContextPreview}
                  weatherContext={weatherContextPreview}
                  environmentType={environmentType}
                  confidence={latestRecommendationPreview?.confidence}
                  weatherUsed={latestRecommendationPreview?.weatherUsed}
                  indoorContext={{
                    potVolumeLiters: potLitersNumber,
                    plantType,
                    baseIntervalDays: intervalDaysNumber
                  }}
                />
              ) : null}

              {environmentType !== 'SEED_START' && aiState === 'fallback' && aiRecommendation ? (
                <RecommendationCard
                  recommendation={aiRecommendation}
                  sensorContext={haContextPreview}
                  weatherContext={weatherContextPreview}
                  environmentType={environmentType}
                  confidence={latestRecommendationPreview?.confidence}
                  weatherUsed={latestRecommendationPreview?.weatherUsed}
                  indoorContext={{
                    potVolumeLiters: potLitersNumber,
                    plantType,
                    baseIntervalDays: intervalDaysNumber
                  }}
                />
              ) : null}

              {environmentType === 'SEED_START' && seedRecommendation && (aiState === 'success' || aiState === 'fallback') ? (
                <SeedRecommendationCard recommendation={seedRecommendation} />
              ) : null}

              {aiState === 'error' ? (
                <div className="space-y-2">
                  <StatusCard
                    tone="danger"
                    title="Не удалось получить AI рекомендации."
                    description={aiErrorMessage ?? 'Проверьте сеть или лимиты OpenRouter.'}
                  />
                  <Button
                    variant="secondary"
                    className="h-auto min-h-[44px] w-full whitespace-normal break-words px-3 py-2 text-center leading-tight"
                    onClick={() => {
                      if (environmentType === 'SEED_START') {
                        const fallback: SeedWizardRecommendation = {
                          source: 'fallback',
                          seedStage,
                          targetEnvironmentType,
                          careMode: 'Следите за влажностью ежедневно и поддерживайте стабильные условия проращивания.',
                          recommendedCheckIntervalHours: 12,
                          recommendedWateringMode: underCover ? 'KEEP_COVERED' : 'LIGHT_SURFACE_WATER',
                          expectedGerminationDaysMin: 4,
                          expectedGerminationDaysMax: 12,
                          summary: 'AI недоступен, поэтому применён базовый режим с мягким контролем влажности.',
                          reasoning: [
                            `Стадия: ${SEED_STAGE_OPTIONS.find((item) => item.value === seedStage)?.label ?? seedStage}`,
                            `Цель: ${environmentLabel(targetEnvironmentType)}`,
                            underCover ? 'Используется укрытие для сохранения влажности.' : 'Без укрытия потребуется более частая визуальная проверка.'
                          ],
                          warnings: ['Проверьте температуру и не допускайте пересыхания верхнего слоя.']
                        };
                        setSeedRecommendation(fallback);
                        setLatestSeedRecommendationPreview({
                          source: 'FALLBACK',
                          seedStage,
                          targetEnvironmentType,
                          careMode: fallback.careMode,
                          recommendedCheckIntervalHours: fallback.recommendedCheckIntervalHours,
                          recommendedWateringMode: fallback.recommendedWateringMode,
                          expectedGerminationDaysMin: fallback.expectedGerminationDaysMin,
                          expectedGerminationDaysMax: fallback.expectedGerminationDaysMax,
                          summary: fallback.summary,
                          reasoning: fallback.reasoning,
                          warnings: fallback.warnings
                        });
                        setAiState('fallback');
                        setAppliedRecommendationSource('none');
                        hapticWarning();
                        return;
                      }

                      const fallback = buildFallbackRecommendation(
                        environmentType,
                        intervalDaysNumber,
                        estimateDefaultWaterMl(environmentType, potLitersNumber, wateringAreaM2Number)
                      );
                      const fallbackCycle = buildCycleDates(fallback.recommendedIntervalDays).map((date) => date.toISOString().slice(0, 10));
                      setAiRecommendation(fallback);
                      setAiState('fallback');
                      setAppliedRecommendationSource('none');
                      hapticWarning();
                      setLatestRecommendationPreview({
                        source: 'FALLBACK',
                        environmentType,
                        recommendedIntervalDays: fallback.recommendedIntervalDays,
                        recommendedWaterMl: fallback.recommendedWaterMl,
                        summary: fallback.summary,
                        reasoning: fallback.reasoning,
                        warnings: fallback.warnings,
                        cyclePreview: { dates: fallbackCycle },
                        sensorContext: haContextPreview ?? undefined
                      });
                    }}
                  >
                    Продолжить с резервным режимом
                  </Button>
                </div>
              ) : null}

              {aiState !== 'loading' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-auto min-h-[44px] w-full whitespace-normal break-words px-3 py-2 text-center leading-tight text-sm"
                    disabled={isRecommendationLoading || !name.trim()}
                    onClick={() => {
                      if (shouldThrottleAction('ai-preview-repeat', 1200)) return;
                      if (environmentType === 'SEED_START') {
                        seedRecommendMutation.mutate();
                        return;
                      }
                      aiRecommendMutation.mutate();
                    }}
                  >
                    Повторить
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-auto min-h-[44px] w-full whitespace-normal break-words px-3 py-2 text-center leading-tight text-sm"
                    disabled={environmentType === 'SEED_START'}
                    onClick={() => {
                      if (environmentType === 'SEED_START') {
                        return;
                      }
                      setManualOverrideEnabled((prev) => !prev);
                    }}
                  >
                    {environmentType === 'SEED_START'
                      ? 'Ручной режим недоступен для семян'
                      : manualOverrideEnabled ? 'Скрыть ручной режим' : 'Ручная настройка'}
                  </Button>
                </div>
              ) : null}

              {environmentType !== 'SEED_START' && aiRecommendation ? (
                <Button
                  className="h-11 w-full"
                  onClick={() => {
                    setFinalIntervalDays(clamp(aiRecommendation.recommendedIntervalDays || intervalDaysNumber, 1, 60));
                    setFinalWaterMl(clamp(aiRecommendation.recommendedWaterMl || estimateDefaultWaterMl(environmentType, potLitersNumber, wateringAreaM2Number), 50, 10_000));
                    const mappedSource = mapPreviewSourceToApplied(latestRecommendationPreview?.source);
                    if (mappedSource !== 'none') {
                      setAppliedRecommendationSource(mappedSource);
                    } else {
                      setAppliedRecommendationSource(aiRecommendation.source === 'fallback' ? 'fallback' : 'ai');
                    }
                    setManualOverrideEnabled(false);
                    hapticSuccess();
                  }}
                >
                  Применить рекомендации
                </Button>
              ) : null}

              {environmentType === 'SEED_START' && seedRecommendation ? (
                <Button
                  className="h-11 w-full"
                  onClick={() => {
                    setAppliedRecommendationSource(seedRecommendation.source === 'ai' ? 'ai' : 'fallback');
                    setManualOverrideEnabled(false);
                    hapticSuccess();
                  }}
                >
                  Применить рекомендации
                </Button>
              ) : null}

              {manualOverrideEnabled && environmentType !== 'SEED_START' ? (
                <div className="theme-surface-2 rounded-ios-button border p-3">
                  <p className="text-sm font-medium text-ios-text">Ручная корректировка</p>
                  <p className="mt-1 text-xs text-ios-subtext">Этот режим не скрывает источник AI или резервного режима и применяется поверх расчёта.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="Интервал (дн.)">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={manualIntervalInput}
                        onChange={(event) => setManualIntervalInput(event.target.value)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                    <Field label="Объём (мл)">
                      <input
                        type="number"
                        min={50}
                        max={10000}
                        step={50}
                        value={manualWaterInput}
                        onChange={(event) => setManualWaterInput(event.target.value)}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                  </div>
                  <Button
                    className="mt-2 h-11 w-full"
                    onClick={() => {
                      const nextInterval = clamp(Number(manualIntervalInput) || finalIntervalDays, 1, 60);
                      const nextWater = clamp(Number(manualWaterInput) || finalWaterMl, 50, 10_000);
                      setFinalIntervalDays(nextInterval);
                      setFinalWaterMl(nextWater);
                      setAppliedRecommendationSource('manual');
                      hapticSuccess();
                    }}
                  >
                    Применить вручную
                  </Button>
                </div>
              ) : null}

              <StatusCard
                tone="neutral"
                title="Выбранный источник для следующего шага"
                description={appliedRecommendationSource === 'none'
                  ? environmentType === 'SEED_START'
                    ? 'Источник ещё не применён. Нажмите «Применить рекомендации», чтобы сохранить режим проращивания.'
                    : 'Источник ещё не применён. Нажмите «Применить рекомендации» или «Применить вручную».'
                  : `Применён источник: ${sourceBadgeLabel(appliedRecommendationSource)}.`}
              />
            </div>
          ) : null}

          {currentStep === 'review' ? (
            <div className="ios-blur-card space-y-4 p-4 sm:p-5">
              <p className="text-ios-body font-semibold">Сводка</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoChip label="Растение" value={name || '—'} />
                <InfoChip label="Профиль" value={environmentLabel(environmentType)} />
                <InfoChip label="Категория" value={categoryLabel(category)} />
                <InfoChip label="Источник" value={sourceBadgeLabel(appliedRecommendationSource)} />
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm">
                <InfoChip
                  label="Контекст сенсоров"
                  value={latestRecommendationPreview?.sensorContext?.available
                    ? `HA · ${latestRecommendationPreview.sensorContext.roomName || 'комната не выбрана'} · уверенность ${latestRecommendationPreview.sensorContext.confidence}`
                    : 'Без HA контекста'}
                />
                <InfoChip
                  label="Погода"
                  value={environmentType === 'INDOOR' || environmentType === 'SEED_START'
                    ? 'Не используется как основной фактор'
                    : weatherContextPreview?.available
                      ? `Учитывается: ${weatherContextPreview.city || region || 'регион'}`
                      : 'Контекст недоступен, возможен резервный режим'}
                />
              </div>

              {environmentType === 'SEED_START' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoChip label="Стадия проращивания" value={SEED_STAGE_OPTIONS.find((item) => item.value === seedStage)?.label ?? seedStage} />
                    <InfoChip label="Цель" value={environmentLabel(targetEnvironmentType)} />
                    <InfoChip label="Проверка" value={seedRecommendation ? `каждые ${seedRecommendation.recommendedCheckIntervalHours} ч` : 'ещё не применено'} />
                    <InfoChip label="Окно всходов" value={seedRecommendation ? `${seedRecommendation.expectedGerminationDaysMin}-${seedRecommendation.expectedGerminationDaysMax} дн.` : 'ещё не рассчитано'} />
                  </div>
                  <div className="theme-surface-2 rounded-ios-button border p-3">
                    <p className="text-sm font-medium">{seedRecommendation?.summary ?? 'Используется базовый режим проращивания.'}</p>
                    {seedRecommendation ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                        <InfoChip label="Режим ухода" value={seedRecommendation.careMode} />
                        <InfoChip label="Режим увлажнения" value={seedWateringModeLabel(seedRecommendation.recommendedWateringMode)} />
                      </div>
                    ) : null}
                    {seedRecommendation?.reasoning?.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-ios-subtext">
                        {seedRecommendation.reasoning.map((item, index) => (
                          <li key={`${item}-${index}`}>• {item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {seedRecommendation?.warnings?.length ? (
                      <ul className="theme-banner-warning mt-2 space-y-1 rounded-ios-button border p-2 text-xs">
                        {seedRecommendation.warnings.map((item, index) => (
                          <li key={`${item}-${index}`}>• {item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="theme-surface-2 rounded-ios-button border p-3">
                    <p className="text-sm font-medium text-ios-text">Outdoor summary</p>
                    <p className="mt-1 text-xs text-ios-subtext">
                      {outdoorReviewLead(environmentType, weatherContextPreview)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <InfoChip label="Растение / культура" value={name || '—'} />
                      <InfoChip label="Локация" value={region.trim() || 'Не указана'} />
                      <InfoChip label="Источник" value={sourceBadgeLabel(appliedRecommendationSource)} />
                      <InfoChip
                        label="Ключевые условия"
                        value={outdoorConditionSummary(environmentType, {
                          containerType,
                          soilType,
                          sunExposure,
                          growthStage,
                          greenhouse,
                          mulched,
                          dripIrrigation,
                          wateringAreaM2: wateringAreaM2Number,
                          potLitersNumber
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Интервал (дней)">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={finalIntervalDays}
                        onChange={(event) => setFinalIntervalDays(clamp(Number(event.target.value) || 1, 1, 60))}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                    <Field label="Объём воды (мл)">
                      <input
                        type="number"
                        min={50}
                        max={10000}
                        step={50}
                        value={finalWaterMl}
                        onChange={(event) => setFinalWaterMl(clamp(Number(event.target.value) || 50, 50, 10_000))}
                        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
                      />
                    </Field>
                  </div>

                  <div className="theme-surface-2 rounded-ios-button border p-3">
                    <p className="text-sm font-medium">{aiRecommendation?.summary ?? 'Используется базовый расчёт.'}</p>
                    <p className="mt-1 text-xs text-ios-subtext">
                      {environmentType === 'OUTDOOR_ORNAMENTAL'
                        ? 'Фокус на формате выращивания, солнце, почве и погоде.'
                        : 'Фокус на стадии роста, площади ухода, укрытии и погоде.'}
                    </p>
                    {aiRecommendation?.warnings?.length ? (
                      <ul className="theme-banner-warning mt-2 space-y-1 rounded-ios-button border p-2 text-xs">
                        {aiRecommendation.warnings.map((item, index) => (
                          <li key={`${item}-${index}`}>• {item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="theme-surface-2 rounded-ios-button border p-3">
                    <p className="mb-2 text-xs text-ios-subtext">Предпросмотр календаря (6 поливов)</p>
                    <motion.div
                      layout
                      className="flex flex-wrap gap-2"
                      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
                    >
                      {reviewDates.map((date) => (
                        <span key={date} className="rounded-full border border-ios-border/60 px-2.5 py-1 text-xs">
                          {date}
                        </span>
                      ))}
                    </motion.div>
                  </div>
                </>
              )}

              {createErrorMessage ? (
                <StatusCard
                  tone="danger"
                  title="Не удалось создать растение"
                  description={createErrorMessage}
                />
              ) : null}

              <motion.div whileTap={{ scale: 0.985 }}>
                <Button
                  className="h-12 w-full active:scale-[0.99] transition-transform"
                  disabled={createMutation.isPending || !name.trim()}
                  onClick={() => {
                    if (shouldThrottleAction('create-plant', 1500)) return;
                    createMutation.mutate();
                  }}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {createMutation.isPending ? 'Создаём растение...' : 'Добавить растение'}
                </Button>
              </motion.div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div
        className={cn(
          'sticky bottom-0 z-10 -mx-1 rounded-t-xl border-t border-ios-border/50 bg-[color:var(--background)]/90 px-1 pt-2 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--background)]/75',
          keyboardVisible && 'shadow-[0_-8px_28px_rgba(0,0,0,0.08)]'
        )}
        style={footerStyle}
      >
        <div className="flex items-center gap-2">
        <motion.div whileTap={{ scale: 0.985 }} className="flex-1">
        <Button variant="secondary" className="h-12 w-full text-base" disabled={stepIndex === 0 || isWizardActionBusy} onClick={goBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Назад
        </Button>
        </motion.div>
        {currentStep !== 'review' ? (
          <motion.div whileTap={{ scale: 0.985 }} className="flex-1">
          <Button className="h-12 w-full text-base" disabled={!canGoNext || isWizardActionBusy} onClick={goNext}>
            Далее
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
          </motion.div>
        ) : null}
        </div>
        <div className="pb-[max(8px,env(safe-area-inset-bottom))]" />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-ios-caption text-ios-subtext">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="theme-surface-subtle inline-flex h-11 w-full items-center justify-between rounded-ios-button border px-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-ios-border/70"
      />
    </label>
  );
}

function StatusCard({ tone, title, description }: { tone: 'neutral' | 'danger'; title: string; description: string }) {
  return (
    <div
      className={cn(
        'rounded-ios-button border p-3 text-sm',
        tone === 'danger'
          ? 'theme-banner-danger'
          : 'theme-surface-2 text-ios-text'
      )}
    >
      <p className="font-medium">{title}</p>
      <p className={cn('mt-1 text-xs', tone === 'danger' ? 'text-[hsl(var(--destructive))]' : 'text-ios-subtext')}>{description}</p>
    </div>
  );
}

function filterSensorsByKind(
  sensors: HaSensorDto[] | undefined,
  kind: 'TEMPERATURE' | 'HUMIDITY' | 'SOIL_MOISTURE' | 'ILLUMINANCE',
  roomId: string
) {
  const base = (sensors ?? []).filter((sensor) => sensor.kind === kind);
  if (!roomId) {
    return base;
  }
  return base.filter((sensor) => !sensor.areaId || sensor.areaId === roomId);
}

function SensorSelect({
  label,
  value,
  onChange,
  sensors
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  sensors: HaSensorDto[];
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="theme-field h-11 w-full rounded-ios-button border px-3 text-base outline-none"
      >
        <option value="">Авто</option>
        {sensors.map((sensor) => (
          <option key={sensor.entityId} value={sensor.entityId}>
            {sensor.friendlyName}
          </option>
        ))}
      </select>
    </Field>
  );
}

function recommendationSourceTone(source: WizardRecommendation['source']) {
  switch (source) {
    case 'ai':
      return { label: 'AI', className: 'theme-badge-success' };
    case 'hybrid':
      return { label: 'AI + погода', className: 'theme-badge-info' };
    case 'weather-adjusted':
      return { label: 'С учётом погоды', className: 'theme-badge-info' };
    case 'manual':
      return { label: 'Вручную', className: 'theme-badge-warning' };
    case 'base-profile':
      return { label: 'Профиль растения', className: 'theme-surface-subtle text-ios-text' };
    case 'fallback':
    default:
      return { label: 'Резервный режим', className: 'theme-badge-warning' };
  }
}

function outdoorLeadSummary(environmentType: EnvironmentType): string {
  switch (environmentType) {
    case 'OUTDOOR_ORNAMENTAL':
      return 'Декоративный outdoor-режим: важны формат выращивания, солнце, почва и погодный фон.';
    case 'OUTDOOR_GARDEN':
      return 'Garden-режим: учитываются стадия роста, укрытие, площадь ухода и агрономические модификаторы.';
    default:
      return 'Рекомендация собрана из текущих условий растения.';
  }
}

function outdoorFactorSummary(
  environmentType: EnvironmentType,
  recommendation: WizardRecommendation,
  weatherContext?: WeatherContextPreviewDto | null
): string {
  if (environmentType === 'OUTDOOR_ORNAMENTAL') {
    return weatherContext?.available
      ? `Фокус на формате выращивания и погоде: ${weatherContext.city || weatherContext.region || 'локация'} · ${weatherContext.temperatureNowC ?? '—'}°C · прогноз осадков ${weatherContext.precipitationForecastMm ?? '—'} мм.`
      : 'Фокус на формате выращивания, солнце и почве; погодный слой сейчас не подтвердился.';
  }
  if (environmentType === 'OUTDOOR_GARDEN') {
    return weatherContext?.available
      ? `Фокус на стадии роста и погоде: ${weatherContext.city || weatherContext.region || 'локация'} · max ${weatherContext.maxTemperatureNext3DaysC ?? '—'}°C · прогноз осадков ${weatherContext.precipitationForecastMm ?? '—'} мм.`
      : 'Фокус на стадии роста, площади ухода и агрономических условиях; погодный слой сейчас не подтвердился.';
  }
  return recommendation.summary;
}

function outdoorReviewLead(
  environmentType: EnvironmentType,
  weatherContext?: WeatherContextPreviewDto | null
): string {
  if (environmentType === 'OUTDOOR_ORNAMENTAL') {
    return weatherContext?.available
      ? 'Декоративный outdoor-сценарий: финальная рекомендация уже собрана с учётом наружных условий.'
      : 'Декоративный outdoor-сценарий: итог опирается на формат выращивания, солнце и почву, без подтверждённого погодного слоя.';
  }
  if (environmentType === 'OUTDOOR_GARDEN') {
    return weatherContext?.available
      ? 'Садовый сценарий: итог учитывает культуру, стадию, площадь ухода и погодный контекст.'
      : 'Садовый сценарий: итог опирается на агрономические параметры, но погодный слой сейчас не подтвердился.';
  }
  return 'Итоговая рекомендация готова к сохранению.';
}

function outdoorConditionSummary(
  environmentType: EnvironmentType,
  options: {
    containerType: ContainerType;
    soilType: SoilType;
    sunExposure: SunExposure;
    growthStage: GrowthStage;
    greenhouse: boolean;
    mulched: boolean;
    dripIrrigation: boolean;
    wateringAreaM2: number;
    potLitersNumber: number;
  }
): string {
  if (environmentType === 'OUTDOOR_ORNAMENTAL') {
    const growingMode = options.containerType === 'POT'
      ? `кашпо ${options.potLitersNumber.toFixed(1)} л`
      : options.containerType === 'CONTAINER'
        ? `контейнер ${options.potLitersNumber.toFixed(1)} л`
        : options.containerType === 'FLOWERBED'
          ? 'клумба'
          : 'открытый грунт';
    return `${growingMode} · ${environmentLabel('OUTDOOR_ORNAMENTAL')} · ${sunExposureLabel(options.sunExposure)} · ${soilTypeLabel(options.soilType)}`;
  }
  return `${growthStageLabel(options.growthStage)} · ${options.greenhouse ? 'теплица' : containerTypeLabel(options.containerType)} · ${sunExposureLabel(options.sunExposure)} · ${soilTypeLabel(options.soilType)} · зона ${options.wateringAreaM2.toFixed(2)} м²`;
}

function RecommendationCard({
  recommendation,
  sensorContext,
  weatherContext,
  environmentType,
  indoorContext,
  confidence,
  weatherUsed
}: {
  recommendation: WizardRecommendation;
  sensorContext?: WateringSensorContextDto | null;
  weatherContext?: WeatherContextPreviewDto | null;
  environmentType: EnvironmentType;
  indoorContext: {
    potVolumeLiters: number;
    plantType: PlantType;
    baseIntervalDays: number;
  };
  confidence?: number;
  weatherUsed?: boolean;
}) {
  const isFallback = recommendation.source === 'fallback' || recommendation.source === 'base-profile';
  const sourceTone = recommendationSourceTone(recommendation.source);
  const weatherLabel = weatherUsed
    ? weatherContext?.fallbackUsed
      ? 'fallback weather'
      : 'погода учтена'
    : 'без погодного слоя';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'rounded-ios-button border p-3',
        isFallback
          ? 'theme-banner-warning'
          : 'theme-banner-success'
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {environmentType === 'OUTDOOR_GARDEN' ? 'Garden recommendation' : environmentType === 'OUTDOOR_ORNAMENTAL' ? 'Outdoor ornamental recommendation' : 'Рекомендации'}
          </p>
          <p className="mt-1 text-xs text-ios-subtext">{outdoorLeadSummary(environmentType)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', sourceTone.className)}>
            {sourceTone.label}
          </span>
          <span className="theme-surface-subtle rounded-full border px-2 py-0.5 text-[11px]">
            {environmentLabel(recommendation.profile)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="theme-surface-subtle rounded-ios-button border p-3">
          <p className="text-ios-subtext">Рекомендованный интервал</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{recommendation.recommendedIntervalDays} дн.</p>
        </div>
        <div className="theme-surface-subtle rounded-ios-button border p-3">
          <p className="text-ios-subtext">Рекомендованный объём</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{recommendation.recommendedWaterMl} мл</p>
        </div>
      </div>

      <div className="theme-surface-subtle mt-2 rounded-ios-button border p-3 text-sm">
        <p className="font-medium text-ios-text">{recommendation.summary}</p>
        <p className="mt-1 text-xs text-ios-subtext">{outdoorFactorSummary(environmentType, recommendation, weatherContext)}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="theme-surface-subtle rounded-full border px-2 py-0.5">
          Уверенность: {confidence != null ? `${Math.round(confidence * 100)}%` : 'н/д'}
        </span>
        <span className="theme-surface-subtle rounded-full border px-2 py-0.5">
          Погода: {weatherLabel}
        </span>
      </div>
      {sensorContext?.available ? (
        <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
          HA: {sensorContext.roomName || 'комната не выбрана'}
          {sensorContext.confidence ? ` · уверенность ${sensorContext.confidence}` : ''}
        </div>
      ) : null}
      {environmentType !== 'INDOOR' ? (
        <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
          Погодный контекст:{' '}
          {weatherContext?.available
            ? `${weatherContext.city || weatherContext.region || 'регион'} · ${weatherContext.temperatureNowC ?? '—'}°C · осадки ${weatherContext.precipitationForecastMm ?? '—'} мм`
            : 'недоступен, возможен резервный режим'}
        </div>
      ) : (
        <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
          Базовый домашний контекст: {indoorContext.potVolumeLiters.toFixed(1)} л · {normalizeRecommendationText(indoorContext.plantType)} · интервал {indoorContext.baseIntervalDays} дн.
        </div>
      )}
      <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
        Почему такой режим: {environmentType === 'INDOOR'
          ? 'учтены параметры горшка, тип растения, размещение и сезон.'
          : environmentType === 'OUTDOOR_ORNAMENTAL'
            ? 'учтены формат выращивания, солнце, почва и наружная погода.'
            : 'учтены стадия роста, площадь ухода, укрытие, агрономические модификаторы и погода.'}
      </div>
      {recommendation.reasoning?.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {recommendation.reasoning.map((item, index) => (
            <li key={`${item}-${index}`} className="inline-flex items-start gap-1.5">
              <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{normalizeRecommendationText(item)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {recommendation.warnings?.length ? (
        <ul className="theme-banner-warning mt-2 space-y-1 rounded-ios-button border p-2 text-xs">
          {recommendation.warnings.map((item, index) => (
            <li key={`${item}-${index}`}>• {item}</li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}

function SeedRecommendationCard({ recommendation }: { recommendation: SeedWizardRecommendation }) {
  const sourceLabel = seedSourceLabel(recommendation.source);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'rounded-ios-button border p-3',
        recommendation.source === 'fallback' ? 'theme-banner-warning' : 'theme-banner-success'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Рекомендации для проращивания</p>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">{sourceLabel}</span>
          <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
            {environmentLabel(recommendation.targetEnvironmentType)}
          </span>
        </div>
      </div>
      <p className="text-sm">{recommendation.summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          Проверять: <b>каждые {recommendation.recommendedCheckIntervalHours} ч</b>
        </div>
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          Всходы: <b>{recommendation.expectedGerminationDaysMin}-{recommendation.expectedGerminationDaysMax} дн.</b>
        </div>
      </div>
      <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
        Режим увлажнения: <b>{seedWateringModeLabel(recommendation.recommendedWateringMode)}</b>
      </div>
      <div className="theme-surface-subtle mt-2 rounded-ios-button border p-2 text-xs">
        Режим ухода: {recommendation.careMode}
      </div>
      {recommendation.reasoning.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {recommendation.reasoning.map((item, index) => (
            <li key={`${item}-${index}`}>• {item}</li>
          ))}
        </ul>
      ) : null}
      {recommendation.warnings.length ? (
        <ul className="theme-banner-warning mt-2 space-y-1 rounded-ios-button border p-2 text-xs">
          {recommendation.warnings.map((item, index) => (
            <li key={`${item}-${index}`}>• {item}</li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-surface-2 rounded-ios-button border p-2">
      <p className="text-[11px] text-ios-subtext">{label}</p>
      <p className="mt-0.5 text-sm font-medium break-words">{value}</p>
    </div>
  );
}
