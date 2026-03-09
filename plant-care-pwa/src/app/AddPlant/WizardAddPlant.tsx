import { useEffect, useMemo, useState } from 'react';
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
  apiFetch,
  createPlant,
  getWateringHaOptions,
  getPwaPushPublicKey,
  getPwaPushStatus,
  previewWateringRecommendation,
  previewWateringHaContext,
  searchPlantPresets,
  searchPlants,
  subscribePwaPush,
  suggestPlantProfile
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { ensurePushSubscription } from '@/lib/pwa';
import { hapticImpact, hapticNotify, hapticSelectionChanged } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import type {
  HaSensorDto,
  OpenRouterIdentifyResult,
  PlantDto,
  PlantPresetSuggestionDto,
  WateringRecommendationPreviewDto,
  WateringSensorContextDto
} from '@/types/api';
import type { PlantCategory } from '@/types/plant';

type WizardStep = 'environment' | 'identify' | 'conditions' | 'ai' | 'review';
type EnvironmentType = 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
type PlantType = 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
type ContainerType = 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND';
type GrowthStage = 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST';
type SoilType = 'LOAMY' | 'SANDY' | 'CLAY';
type SunExposure = 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE';
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

interface WeatherContextPreviewDto {
  available: boolean;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateDefaultWaterMl(environmentType: EnvironmentType, potVolumeLiters: number, heightCm: number) {
  if (environmentType === 'OUTDOOR_GARDEN') {
    return clamp(Math.round(Math.max(25, heightCm) * 10), 350, 4000);
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

function buildFallbackRecommendation(environmentType: EnvironmentType, interval: number, waterMl: number): WizardRecommendation {
  const summary = environmentType === 'INDOOR'
    ? 'Рекомендации рассчитаны по базовому indoor-профилю.'
    : environmentType === 'OUTDOOR_ORNAMENTAL'
      ? 'Рекомендации рассчитаны по базовому профилю декоративных уличных растений.'
      : 'Рекомендации рассчитаны по базовому профилю садовых культур.';

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
    warnings: ['AI недоступен, использован fallback.'],
    profile: environmentType
  };
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
      return 'Weather adjusted';
    case 'hybrid':
      return 'Hybrid';
    case 'fallback':
      return 'Fallback';
    case 'base-profile':
      return 'Base profile';
    case 'manual':
      return 'Manual';
    default:
      return 'Не выбран';
  }
}

export function WizardAddPlant() {
  const prefersReducedMotion = useReducedMotion();
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

  const [plantType, setPlantType] = useState<PlantType>('DEFAULT');
  const [baseIntervalDays, setBaseIntervalDays] = useState('7');
  const [potVolumeLiters, setPotVolumeLiters] = useState('2');
  const [heightCm, setHeightCm] = useState('45');
  const [diameterCm, setDiameterCm] = useState('35');
  const [containerType, setContainerType] = useState<ContainerType>('POT');
  const [growthStage, setGrowthStage] = useState<GrowthStage>('VEGETATIVE');
  const [greenhouse, setGreenhouse] = useState(false);
  const [soilType, setSoilType] = useState<SoilType>('LOAMY');
  const [sunExposure, setSunExposure] = useState<SunExposure>('PARTIAL_SHADE');
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
  const [latestRecommendationPreview, setLatestRecommendationPreview] = useState<WateringRecommendationPreviewDto | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
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
  const category = mapEnvironmentToCategory(environmentType);

  const intervalDaysNumber = clamp(Number(baseIntervalDays) || 7, 1, 60);
  const potLitersNumber = Math.max(0.2, Number(potVolumeLiters) || 2);
  const heightNumber = Math.max(10, Number(heightCm) || 45);
  const diameterNumber = Math.max(10, Number(diameterCm) || 35);

  useEffect(() => {
    if (aiState === 'idle') {
      setFinalIntervalDays(intervalDaysNumber);
      setFinalWaterMl(estimateDefaultWaterMl(environmentType, potLitersNumber, heightNumber));
    }
  }, [aiState, intervalDaysNumber, environmentType, potLitersNumber, heightNumber]);

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
      const [localPlants, presetItems] = await Promise.all([
        searchPlants(q, category),
        searchPlantPresets(category, q, 12)
      ]);
      return { localPlants, presetItems };
    },
    onSuccess: ({ localPlants, presetItems }) => {
      const merged = new Set<string>();
      localPlants.forEach((item) => merged.add(item.name));
      presetItems.forEach((item) => merged.add(item.name));
      setHints(Array.from(merged).slice(0, 8));
      setPresets(presetItems);
      setLastSearchHadResults(merged.size > 0 || presetItems.length > 0);
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
      environmentType,
      baseIntervalDays: intervalDaysNumber,
      potVolumeLiters: environmentType === 'INDOOR' ? potLitersNumber : undefined,
      containerType: environmentType === 'INDOOR' ? undefined : containerType,
      containerVolume: environmentType === 'OUTDOOR_ORNAMENTAL' && containerType !== 'OPEN_GROUND' ? potLitersNumber : undefined,
      growthStage: environmentType === 'OUTDOOR_GARDEN' ? growthStage : undefined,
      greenhouse: environmentType === 'OUTDOOR_GARDEN' ? greenhouse : undefined,
      soilType,
      sunExposure,
      cropType: environmentType === 'OUTDOOR_GARDEN' ? name.trim() : undefined,
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
      setAiState(normalized.source === 'fallback' ? 'fallback' : 'success');
      setManualOverrideEnabled(false);
      hapticNotify('success');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Ошибка AI расчёта';
      setAiErrorMessage(message);
      setAiState('error');
      setAppliedRecommendationSource('none');
      setLatestRecommendationPreview(null);
      hapticNotify('error');
    }
  });

  const haContextPreviewMutation = useMutation({
    mutationFn: () => previewWateringHaContext({
      plantName: name.trim(),
      environmentType,
      haRoomId: haRoomId || undefined,
      haRoomName: haRoomName || undefined,
      temperatureSensorEntityId: temperatureSensorEntityId || undefined,
      humiditySensorEntityId: humiditySensorEntityId || undefined,
      soilMoistureSensorEntityId: soilMoistureSensorEntityId || undefined,
      illuminanceSensorEntityId: illuminanceSensorEntityId || undefined
    }),
    onSuccess: (result) => {
      setHaContextPreview(result);
      hapticNotify(result.available ? 'success' : 'warning');
    },
    onError: () => {
      setHaContextPreview(null);
      hapticNotify('error');
    }
  });

  const weatherPreviewMutation = useMutation({
    mutationFn: () => apiFetch<WeatherContextPreviewDto>('/api/watering/recommendation/weather/preview', {
      method: 'POST',
      body: JSON.stringify({
        plantName: name.trim(),
        environmentType,
        city: region.trim() || undefined,
        region: region.trim() || undefined
      })
    }),
    onSuccess: (result) => {
      setWeatherContextPreview(result);
      hapticNotify(result.available ? 'success' : 'warning');
    },
    onError: () => {
      setWeatherContextPreview(null);
      hapticNotify('error');
    }
  });

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
      const status = await getPwaPushStatus();
      if (status.subscribed) {
        localStorage.setItem(promptKey, '1');
        return;
      }
      const subscription = await ensurePushSubscription(keyData.publicKey);
      if (!subscription) {
        return;
      }
      await subscribePwaPush(subscription.toJSON());
      localStorage.setItem(promptKey, '1');
      hapticNotify('success');
    } catch {
      // Пользователь может включить push позже в настройках.
    }
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const placement = environmentType === 'INDOOR' ? 'INDOOR' : 'OUTDOOR';
      const outdoorAreaM2 = environmentType === 'OUTDOOR_GARDEN'
        ? Math.PI * Math.pow((diameterNumber / 100) / 2, 2)
        : null;
      const shouldUsePot = environmentType !== 'OUTDOOR_GARDEN' || containerType !== 'OPEN_GROUND';

      return createPlant({
        name: name.trim(),
        category,
        environmentType,
        wateringProfile: environmentType,
        placement,
        type: plantType,
        region: region.trim() || null,
        containerType: environmentType === 'INDOOR' ? 'POT' : containerType,
        containerVolumeLiters: environmentType === 'OUTDOOR_GARDEN' && containerType === 'OPEN_GROUND'
          ? null
          : potLitersNumber,
        cropType: environmentType === 'OUTDOOR_GARDEN' ? name.trim() : null,
        growthStage: environmentType === 'OUTDOOR_GARDEN' ? growthStage : null,
        greenhouse: environmentType === 'OUTDOOR_GARDEN' ? greenhouse : null,
        dripIrrigation: environmentType === 'OUTDOOR_GARDEN' ? dripIrrigation : null,
        baseIntervalDays: finalIntervalDays,
        preferredWaterMl: finalWaterMl,
        potVolumeLiters: shouldUsePot ? potLitersNumber : 1,
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
      const backendSource = mapAppliedSourceToBackend(appliedRecommendationSource);
      if (backendSource) {
        try {
          await apiFetch(`/api/watering/recommendation/${createdPlant.id}/apply`, {
            method: 'POST',
            body: JSON.stringify({
            source: backendSource,
            recommendedIntervalDays: finalIntervalDays,
            recommendedWaterMl: finalWaterMl,
            summary: aiRecommendation?.summary
            })
          });
        } catch {
          // Не блокируем создание растения, если пост-сохранение источника рекомендации не удалось.
        }
      }
      hapticNotify('success');
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void maybeEnablePushOnFirstPlant(hadPlantsBeforeCreate);
      setActiveTab('home');
      openPlantDetail(createdPlant.id);
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setHints([]);
      setPresets([]);
      setLastSearchHadResults(true);
      return;
    }

    const timer = window.setTimeout(() => {
      searchMutation.mutate(q);
    }, 280);
    return () => window.clearTimeout(timer);
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
      if (environmentType === 'INDOOR') {
        return potLitersNumber > 0 && intervalDaysNumber > 0;
      }
      if (environmentType === 'OUTDOOR_ORNAMENTAL') {
        const needsVolume = containerType !== 'OPEN_GROUND';
        return intervalDaysNumber > 0 && (!needsVolume || potLitersNumber > 0);
      }
      return intervalDaysNumber > 0 && heightNumber > 0 && diameterNumber > 0;
    }
    if (currentStep === 'ai') {
      return appliedRecommendationSource !== 'none';
    }
    return false;
  }, [
    currentStep,
    name,
    environmentType,
    potLitersNumber,
    intervalDaysNumber,
    containerType,
    heightNumber,
    diameterNumber,
    appliedRecommendationSource
  ]);

  const goNext = () => {
    if (!canGoNext) {
      return;
    }
    hapticImpact('light');
    setStepDirection(1);
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => {
    hapticImpact('light');
    setStepDirection(-1);
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const nextStepTitle = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]?.title ?? STEPS[stepIndex].title;
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
            <h2 className="mt-1 text-[clamp(1.2rem,4.9vw,1.5rem)] font-semibold leading-tight text-ios-text">Добавление растения</h2>
            <p className="mt-1 text-sm text-ios-subtext">{STEPS[stepIndex].title}</p>
          </div>
          <span className="rounded-full border border-ios-border/60 bg-white/60 px-2.5 py-1 text-[11px] text-ios-subtext dark:bg-zinc-900/50">
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
                        : 'border-ios-border/60 bg-white/60 hover:border-ios-accent/35 dark:bg-zinc-900/45'
                    )}
                    onClick={() => {
                      hapticSelectionChanged();
                      setEnvironmentType(key);
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
                        setSearchQuery(event.target.value);
                        setName(event.target.value);
                      }}
                      placeholder="Например: Фикус, Роза, Томат"
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 pl-9 pr-3 text-base outline-none dark:bg-zinc-900/60"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="h-11"
                    disabled={searchMutation.isPending}
                    onClick={() => searchMutation.mutate(searchQuery.trim())}
                  >
                    {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
                  </Button>
                </div>

                {searchQuery.trim() && !searchMutation.isPending && !lastSearchHadResults ? (
                  <p className="mt-3 rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm text-ios-subtext dark:bg-zinc-900/50">
                    Ничего не найдено. Попробуйте другое название или используйте AI-определение по фото.
                  </p>
                ) : null}

                {presets.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {presets.map((item) => (
                      <button
                        key={`${item.category}:${item.name}`}
                        type="button"
                        className="rounded-full border border-ios-border/60 bg-white/65 px-3 py-1.5 text-xs dark:bg-zinc-900/50"
                        onClick={() => {
                          hapticSelectionChanged();
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
                          hapticSelectionChanged();
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
              <Field label="Базовый интервал полива (дней)">
                <input
                  type="number"
                  min={1}
                  value={baseIntervalDays}
                  onChange={(event) => setBaseIntervalDays(event.target.value)}
                  className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                />
              </Field>

              <Field label="Регион / город">
                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="Например: Санкт-Петербург"
                  className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                />
              </Field>

              {environmentType === 'INDOOR' ? (
                <>
                  <Field label="Объём горшка (л)">
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={potVolumeLiters}
                      onChange={(event) => setPotVolumeLiters(event.target.value)}
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                    />
                  </Field>
                  <Field label="Тип растения">
                    <select
                      value={plantType}
                      onChange={(event) => setPlantType(event.target.value as PlantType)}
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                  <Field label="Где растёт">
                    <select
                      value={containerType}
                      onChange={(event) => setContainerType(event.target.value as ContainerType)}
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                    >
                      {CONTAINER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>

                  {containerType !== 'OPEN_GROUND' ? (
                    <Field label="Объём контейнера (л)">
                      <input
                        type="number"
                        min={0.2}
                        step={0.1}
                        value={potVolumeLiters}
                        onChange={(event) => setPotVolumeLiters(event.target.value)}
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              {environmentType !== 'INDOOR' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Освещённость">
                      <select
                        value={sunExposure}
                        onChange={(event) => setSunExposure(event.target.value as SunExposure)}
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                      >
                        {SOIL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:bg-zinc-900/50">
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
                        onClick={() => weatherPreviewMutation.mutate()}
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
                            ? `Confidence: ${weatherContextPreview.confidence || 'N/A'}`
                            : 'Будет использован fallback без погодных корректировок.'}
                        />
                        {weatherContextPreview.available ? (
                          <div className="grid grid-cols-2 gap-2 text-xs text-ios-subtext">
                            <div className="rounded-ios-button border border-ios-border/50 bg-white/50 p-2 dark:bg-zinc-900/40">
                              Сейчас: <b>{weatherContextPreview.temperatureNowC ?? '—'}°C</b>
                            </div>
                            <div className="rounded-ios-button border border-ios-border/50 bg-white/50 p-2 dark:bg-zinc-900/40">
                              Влажность: <b>{weatherContextPreview.humidityNowPercent ?? '—'}%</b>
                            </div>
                            <div className="rounded-ios-button border border-ios-border/50 bg-white/50 p-2 dark:bg-zinc-900/40">
                              Осадки 24ч: <b>{weatherContextPreview.precipitationLast24hMm ?? '—'} мм</b>
                            </div>
                            <div className="rounded-ios-button border border-ios-border/50 bg-white/50 p-2 dark:bg-zinc-900/40">
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
                  <Field label="Стадия роста">
                    <select
                      value={growthStage}
                      onChange={(event) => setGrowthStage(event.target.value as GrowthStage)}
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                    >
                      {GROWTH_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Высота (см)">
                      <input
                        type="number"
                        min={10}
                        value={heightCm}
                        onChange={(event) => setHeightCm(event.target.value)}
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                      />
                    </Field>
                    <Field label="Диаметр (см)">
                      <input
                        type="number"
                        min={10}
                        value={diameterCm}
                        onChange={(event) => setDiameterCm(event.target.value)}
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                      />
                    </Field>
                  </div>

                  <ToggleRow label="Теплица" checked={greenhouse} onChange={setGreenhouse} />
                  <ToggleRow label="Мульча" checked={mulched} onChange={setMulched} />
                  <ToggleRow label="Капельный полив" checked={dripIrrigation} onChange={setDripIrrigation} />
                </>
              ) : null}

              <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:bg-zinc-900/50">
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
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                    onClick={() => haContextPreviewMutation.mutate()}
                  >
                    {haContextPreviewMutation.isPending ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Проверяем HA контекст…</span>
                    ) : 'Проверить HA контекст'}
                  </Button>

                  {haContextPreview ? (
                    <StatusCard
                      tone={haContextPreview.available ? 'neutral' : 'danger'}
                      title={haContextPreview.available ? 'HA контекст найден' : 'HA контекст недоступен'}
                      description={haContextPreview.message ?? (haContextPreview.available ? 'Данные сенсоров будут учтены в AI шаге.' : 'Проверьте комнату/сенсоры.')}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 'ai' ? (
            <div className="ios-blur-card space-y-4 p-4 sm:p-5">
              <Button
                className="h-12 w-full"
                disabled={aiRecommendMutation.isPending || !name.trim()}
                onClick={() => aiRecommendMutation.mutate()}
              >
                {aiRecommendMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Рассчитываем рекомендации AI...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Рассчитать рекомендации AI
                  </span>
                )}
              </Button>

              {aiState === 'idle' ? (
                <StatusCard
                  tone="neutral"
                  title="Нажмите кнопку, чтобы получить AI расчёт."
                  description="AI учтёт профиль растения, условия выращивания и погодный контекст."
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
                    description="Получаем структурированные рекомендации по интервалу и объёму полива."
                  />
                </motion.div>
              ) : null}

              {aiState === 'success' && aiRecommendation ? (
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

              {aiState === 'fallback' && aiRecommendation ? (
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

              {aiState === 'error' ? (
                <div className="space-y-2">
                  <StatusCard
                    tone="danger"
                    title="Не удалось получить AI рекомендации."
                    description={aiErrorMessage ?? 'Проверьте сеть или лимиты OpenRouter.'}
                  />
                  <Button
                    variant="secondary"
                    className="h-11 w-full"
                    onClick={() => {
                      const fallback = buildFallbackRecommendation(
                        environmentType,
                        intervalDaysNumber,
                        estimateDefaultWaterMl(environmentType, potLitersNumber, heightNumber)
                      );
                      const fallbackCycle = buildCycleDates(fallback.recommendedIntervalDays).map((date) => date.toISOString().slice(0, 10));
                      setAiRecommendation(fallback);
                      setAiState('fallback');
                      setAppliedRecommendationSource('none');
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
                    Продолжить с fallback
                  </Button>
                </div>
              ) : null}

              {aiState !== 'loading' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-11 w-full"
                    disabled={aiRecommendMutation.isPending || !name.trim()}
                    onClick={() => aiRecommendMutation.mutate()}
                  >
                    Повторить
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11 w-full"
                    onClick={() => setManualOverrideEnabled((prev) => !prev)}
                  >
                    {manualOverrideEnabled ? 'Скрыть ручной режим' : 'Ручная настройка'}
                  </Button>
                </div>
              ) : null}

              {aiRecommendation ? (
                <Button
                  className="h-11 w-full"
                  onClick={() => {
                    setFinalIntervalDays(clamp(aiRecommendation.recommendedIntervalDays || intervalDaysNumber, 1, 60));
                    setFinalWaterMl(clamp(aiRecommendation.recommendedWaterMl || estimateDefaultWaterMl(environmentType, potLitersNumber, heightNumber), 50, 10_000));
                    const mappedSource = mapPreviewSourceToApplied(latestRecommendationPreview?.source);
                    if (mappedSource !== 'none') {
                      setAppliedRecommendationSource(mappedSource);
                    } else {
                      setAppliedRecommendationSource(aiRecommendation.source === 'fallback' ? 'fallback' : 'ai');
                    }
                    setManualOverrideEnabled(false);
                    hapticNotify('success');
                  }}
                >
                  Применить рекомендации
                </Button>
              ) : null}

              {manualOverrideEnabled ? (
                <div className="rounded-ios-button border border-ios-border/60 bg-white/65 p-3 dark:bg-zinc-900/50">
                  <p className="text-sm font-medium text-ios-text">Ручная корректировка</p>
                  <p className="mt-1 text-xs text-ios-subtext">Этот режим не скрывает источник AI/Fallback и применяется поверх расчёта.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="Интервал (дн.)">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={manualIntervalInput}
                        onChange={(event) => setManualIntervalInput(event.target.value)}
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                      hapticNotify('success');
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
                  ? 'Источник ещё не применён. Нажмите «Применить рекомендации» или «Применить вручную».'
                  : `Применён источник: ${sourceBadgeLabel(appliedRecommendationSource)}.`}
              />
            </div>
          ) : null}

          {currentStep === 'review' ? (
            <div className="ios-blur-card space-y-4 p-4 sm:p-5">
              <p className="text-ios-body font-semibold">Сводка</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoChip label="Растение" value={name || '—'} />
                <InfoChip label="Профиль" value={environmentType} />
                <InfoChip label="Категория" value={category} />
                <InfoChip label="Источник" value={sourceBadgeLabel(appliedRecommendationSource)} />
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm">
                <InfoChip
                  label="Контекст сенсоров"
                  value={latestRecommendationPreview?.sensorContext?.available
                    ? `HA · ${latestRecommendationPreview.sensorContext.roomName || 'комната не выбрана'} · confidence ${latestRecommendationPreview.sensorContext.confidence}`
                    : 'Без HA контекста'}
                />
                <InfoChip
                  label="Погода"
                  value={environmentType === 'INDOOR'
                    ? 'Не используется как основной фактор'
                    : weatherContextPreview?.available
                      ? `Учитывается: ${weatherContextPreview.city || region || 'регион'}`
                      : 'Контекст недоступен, возможен fallback'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Интервал (дней)">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={finalIntervalDays}
                    onChange={(event) => setFinalIntervalDays(clamp(Number(event.target.value) || 1, 1, 60))}
                    className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
                    className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
                  />
                </Field>
              </div>

              <div className="rounded-ios-button border border-ios-border/60 bg-white/65 p-3 dark:bg-zinc-900/50">
                <p className="text-sm font-medium">{aiRecommendation?.summary ?? 'Используется базовый расчёт.'}</p>
                {aiRecommendation?.reasoning?.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-ios-subtext">
                    {aiRecommendation.reasoning.map((item, index) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    ))}
                  </ul>
                ) : null}
                {aiRecommendation?.warnings?.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                    {aiRecommendation.warnings.map((item, index) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-ios-button border border-ios-border/60 bg-white/65 p-3 dark:bg-zinc-900/50">
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

              <motion.div whileTap={{ scale: 0.985 }}>
                <Button
                  className="h-12 w-full active:scale-[0.99] transition-transform"
                  disabled={createMutation.isPending || !name.trim()}
                  onClick={() => createMutation.mutate()}
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
        <Button variant="secondary" className="h-12 w-full text-base" disabled={stepIndex === 0} onClick={goBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Назад
        </Button>
        </motion.div>
        {currentStep !== 'review' ? (
          <motion.div whileTap={{ scale: 0.985 }} className="flex-1">
          <Button className="h-12 w-full text-base" disabled={!canGoNext} onClick={goNext}>
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
    <label className="inline-flex h-11 w-full items-center justify-between rounded-ios-button border border-ios-border/60 bg-white/65 px-3 text-sm dark:bg-zinc-900/50">
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
          ? 'border-red-300/60 bg-red-50/70 text-red-700 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-300'
          : 'border-ios-border/60 bg-white/65 text-ios-text dark:bg-zinc-900/50'
      )}
    >
      <p className="font-medium">{title}</p>
      <p className={cn('mt-1 text-xs', tone === 'danger' ? 'text-red-600 dark:text-red-200' : 'text-ios-subtext')}>{description}</p>
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
        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-base outline-none dark:bg-zinc-900/60"
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
  const badge =
    recommendation.source === 'ai' ? 'AI' :
      recommendation.source === 'weather-adjusted' ? 'Weather adjusted' :
        recommendation.source === 'hybrid' ? 'Hybrid' :
          recommendation.source === 'manual' ? 'Manual' :
            recommendation.source === 'base-profile' ? 'Base profile' : 'Fallback';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'rounded-ios-button border p-3',
        isFallback
          ? 'border-amber-300/60 bg-amber-50/70 dark:border-amber-700/45 dark:bg-amber-950/25'
          : 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-700/45 dark:bg-emerald-950/25'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {isFallback ? 'Fallback рекомендации' : 'Рекомендации'}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
            {badge}
          </span>
          <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
            {recommendation.profile}
          </span>
        </div>
      </div>
      <p className="text-sm">{recommendation.summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-ios-button border border-current/15 bg-white/60 p-2 dark:bg-black/10">
          Интервал: <b>{recommendation.recommendedIntervalDays} дн.</b>
        </div>
        <div className="rounded-ios-button border border-current/15 bg-white/60 p-2 dark:bg-black/10">
          Объём: <b>{recommendation.recommendedWaterMl} мл</b>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full border border-current/20 bg-white/55 px-2 py-0.5 dark:bg-black/10">
          Уверенность: {confidence != null ? `${Math.round(confidence * 100)}%` : 'N/A'}
        </span>
        <span className="rounded-full border border-current/20 bg-white/55 px-2 py-0.5 dark:bg-black/10">
          Погода: {weatherUsed ? 'учтена' : 'не основной фактор'}
        </span>
      </div>
      {sensorContext?.available ? (
        <div className="mt-2 rounded-ios-button border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
          HA: {sensorContext.roomName || 'комната не выбрана'}
          {sensorContext.confidence ? ` · confidence ${sensorContext.confidence}` : ''}
        </div>
      ) : null}
      {environmentType !== 'INDOOR' ? (
        <div className="mt-2 rounded-ios-button border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
          Погодный контекст:{' '}
          {weatherContext?.available
            ? `${weatherContext.city || weatherContext.region || 'регион'} · ${weatherContext.temperatureNowC ?? '—'}°C · осадки ${weatherContext.precipitationForecastMm ?? '—'} мм`
            : 'недоступен, fallback возможен'}
        </div>
      ) : (
        <div className="mt-2 rounded-ios-button border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
          Базовый indoor контекст: {indoorContext.potVolumeLiters.toFixed(1)} л · {indoorContext.plantType} · интервал {indoorContext.baseIntervalDays} дн.
        </div>
      )}
      <div className="mt-2 rounded-ios-button border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
        Почему такой режим: {environmentType === 'INDOOR'
          ? 'учтены параметры горшка, тип растения, размещение и сезон.'
          : 'учтены осадки, температура, влажность и тип почвы.'}
      </div>
      {recommendation.reasoning?.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {recommendation.reasoning.map((item, index) => (
            <li key={`${item}-${index}`} className="inline-flex items-start gap-1.5">
              <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {recommendation.warnings?.length ? (
        <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
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
    <div className="rounded-ios-button border border-ios-border/60 bg-white/65 p-2 dark:bg-zinc-900/50">
      <p className="text-[11px] text-ios-subtext">{label}</p>
      <p className="mt-0.5 text-sm font-medium break-words">{value}</p>
    </div>
  );
}
