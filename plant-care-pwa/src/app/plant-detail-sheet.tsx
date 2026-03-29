import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Droplets, Leaf, Loader2, RefreshCcw, Sprout, Trash2, Trees, Warehouse } from 'lucide-react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { Dialog } from '@/components/ui/dialog';
import { PlantDetailPage } from '@/app/PlantDetail/PlantDetailPage';
import { GrowthCarousel } from '@/components/GrowthCarousel';
import { LeafDiagnosis } from '@/components/LeafDiagnosis';
import { SeedStageActionsCard } from '@/components/seed/SeedStageActionsCard';
import { seedActionLabel } from '@/components/seed/seedStageUi';
import { getPlantSourceTone, getPlantStatusTone } from '@/components/plants/plantRecommendationUi';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import { Button } from '@/components/ui/button';
import {
  apiFetch,
  deletePlant,
  getPlantById,
  getPlantCareAdvice,
  getRecommendationHistory,
  migrateSeedPlant,
  previewSeedMigration,
  recordSeedCareAction,
  updateSeedStage,
  uploadPlantPhoto,
  waterPlant
} from '@/lib/api';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';
import {
  error as hapticError,
  impactHeavy,
  impactLight,
  impactMedium,
  success as hapticSuccess
} from '@/lib/haptics';
import { useUiStore } from '@/lib/store';
import { buildExplainabilityViewModel } from '@/lib/explainability';
import type {
  CalendarEventDto,
  PlantCareAdviceDto,
  PlantDto,
  RecommendationHistoryItemDto,
  RecommendationHistoryResponseDto,
  WateringRecommendationPreviewDto
} from '@/types/api';

function getProgress(plant: PlantDto): number {
  const last = parseDateOnly(plant.lastWateredDate);
  const next = plant.nextWateringDate
    ? parseDateOnly(plant.nextWateringDate)
    : new Date(last.getTime() + Math.max(1, plant.baseIntervalDays ?? 7) * 86_400_000);
  const now = new Date();
  const cycleDays = Math.max(1, Math.floor((next.getTime() - last.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
  return Math.max(0, Math.min(100, (elapsedDays / cycleDays) * 100));
}

function getIsOverdue(plant: PlantDto): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = plant.nextWateringDate
    ? parseDateOnly(plant.nextWateringDate)
    : new Date(parseDateOnly(plant.lastWateredDate).getTime() + Math.max(1, plant.baseIntervalDays ?? 7) * 86_400_000);
  const target = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return target.getTime() < today.getTime();
}

function getNextDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return parseDateOnly(plant.nextWateringDate);
  }
  const last = parseDateOnly(plant.lastWateredDate);
  const next = new Date(last);
  next.setDate(next.getDate() + Math.max(1, plant.baseIntervalDays ?? 7));
  return next;
}

function hasWateredToday(plant: PlantDto): boolean {
  return startOfLocalDay(parseDateOnly(plant.lastWateredDate)).getTime() === startOfLocalDay(new Date()).getTime();
}

function normalizeAdviceText(data?: PlantCareAdviceDto | null): string | null {
  if (!data) {
    return null;
  }

  const note = data.note?.trim() ?? '';
  if (note && note.toLowerCase() !== 'нет дополнительных рекомендаций') {
    return note;
  }

  if (data.additives?.length) {
    return `Добавки: ${data.additives.slice(0, 3).join(', ')}.`;
  }

  if (data.soilComposition?.length) {
    return `Грунт: ${data.soilComposition.slice(0, 4).join(', ')}.`;
  }

  const soilType = data.soilType?.trim();
  if (soilType && soilType.toLowerCase() !== 'не указано') {
    return `Подходящий грунт: ${soilType}.`;
  }

  return null;
}

function updatePlantCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  plantId: number,
  updater: (plant: PlantDto) => PlantDto
) {
  queryClient.setQueryData<PlantDto | null>(['plant', plantId], (current) => {
    if (!current) {
      return current;
    }
    return updater(current);
  });
  queryClient.setQueryData<PlantDto[]>(['plants'], (current) => {
    if (!current) {
      return current;
    }
    return current.map((item) => (item.id === plantId ? updater(item) : item));
  });
}

function updateCalendarAfterWatering(
  events: CalendarEventDto[] | undefined,
  updatedPlant: PlantDto
): CalendarEventDto[] {
  const items = (events ?? []).filter((event) => event.plantId !== updatedPlant.id);
  if (!updatedPlant.nextWateringDate) {
    return items;
  }
  return [
    ...items,
    {
      date: updatedPlant.nextWateringDate.slice(0, 10),
      plantId: updatedPlant.id,
      plantName: updatedPlant.name
    }
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function appendSeedActionEntry(plant: PlantDto, action: 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT') {
  const timestamp = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const nextActions = [`${timestamp} | ${seedActionLabel(action)}`, ...(plant.seedActions ?? [])].slice(0, 20);
  return {
    ...plant,
    seedActions: nextActions,
    underCover: action === 'REMOVE_COVER' ? false : plant.underCover,
    growLight: action === 'MOVE_TO_LIGHT' ? true : plant.growLight
  };
}

function recommendationBadge(source?: string | null): string {
  const normalized = (source ?? '').toUpperCase();
  if (!normalized) return 'Неизвестно';
  if (normalized.includes('WEATHER')) return 'С учётом погоды';
  if (normalized.includes('HYBRID')) return 'Гибридный';
  if (normalized.includes('FALLBACK') || normalized.includes('HEURISTIC') || normalized.includes('BASE')) return 'Резервный';
  if (normalized.includes('MANUAL')) return 'Вручную';
  if (normalized.includes('AI') || normalized.includes('OPENROUTER')) return 'AI';
  return source ?? 'Неизвестно';
}

function humanizeWateringProfile(profile?: string | null): string | null {
  const normalized = (profile ?? '').trim().toUpperCase();
  switch (normalized) {
    case 'INDOOR':
      return 'домашний';
    case 'OUTDOOR':
      return 'уличный';
    case 'OUTDOOR_ORNAMENTAL':
      return 'уличный декоративный';
    case 'OUTDOOR_GARDEN':
      return 'садовый';
    default:
      return profile?.trim() ? profile.toLowerCase() : null;
  }
}

function humanizeWateringMode(mode?: string | null): string {
  const normalized = (mode ?? '').toUpperCase();
  switch (normalized) {
    case 'LIGHT':
      return 'Лёгкий полив';
    case 'DEEP':
      return 'Глубокий полив';
    case 'SOIL_CHECK_FIRST':
      return 'Сначала проверить почву';
    case 'WEATHER_GUIDED':
      return 'С учётом погоды';
    case 'STANDARD':
    default:
      return 'Стандартный режим';
  }
}

function formatAiAdviceSource(source: string | null): string {
  if (!source) {
    return 'AI';
  }
  if (source.toLowerCase().startsWith('openrouter:')) {
    return 'AI через OpenRouter';
  }
  return source;
}

function recommendationUiState(
  loading: boolean,
  error: boolean,
  recommendation?: WateringRecommendationPreviewDto | null
): 'idle' | 'loading' | 'success' | 'fallback' | 'error' {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!recommendation) return 'idle';
  const source = (recommendation.source ?? '').toUpperCase();
  if (source === 'FALLBACK' || source === 'HEURISTIC' || source === 'BASE_PROFILE') return 'fallback';
  return 'success';
}

function formatRecommendationMoment(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function historySourceBadge(item?: RecommendationHistoryItemDto | null): string {
  if (!item) return 'История';
  const source = (item.source ?? '').toUpperCase();
  if (source.includes('APPLY')) return 'Вручную';
  if (source.includes('SEED')) return 'Стадия';
  if (source.includes('SCHEDULED') || source.includes('SYSTEM')) return 'Авто';
  if (source.includes('REFRESH')) return 'Пересчёт';
  if (source.includes('CREATE')) return 'Старт';
  return item.manualOverrideActive ? 'Вручную' : 'Авто';
}

function historyDeltaLabel(item?: RecommendationHistoryItemDto | null): string | null {
  if (!item) return null;
  if (item.deltaIntervalDays && item.deltaIntervalDays !== 0) {
    return item.deltaIntervalDays > 0 ? `+${item.deltaIntervalDays} дн.` : `${item.deltaIntervalDays} дн.`;
  }
  if (item.deltaWaterMl && item.deltaWaterMl !== 0) {
    return item.deltaWaterMl > 0 ? `+${item.deltaWaterMl} мл` : `${item.deltaWaterMl} мл`;
  }
  return null;
}

function historyReasonLine(item?: RecommendationHistoryItemDto | null): string {
  if (!item) {
    return 'Здесь появятся заметные изменения режима ухода.';
  }
  if (item.eventType === 'INITIAL_RECOMMENDATION_APPLIED') {
    return item.seedStage ? 'Стартовый режим проращивания сохранён как отправная точка.' : 'Стартовый режим ухода сохранён как отправная точка.';
  }
  if (item.eventType === 'MIGRATED_FROM_SEED') {
    return 'После выхода из режима проращивания растение перешло к обычной логике ухода.';
  }
  if (item.eventType === 'MANUAL_RECOMMENDATION_APPLIED' || item.eventType === 'MANUAL_OVERRIDE_APPLIED') {
    return 'Пользователь изменил режим ухода вручную.';
  }
  if (item.eventType === 'MANUAL_OVERRIDE_REMOVED') {
    return 'Автоматический режим снова активен.';
  }
  if (item.eventType === 'SEED_STAGE_CHANGE' && item.seedStage) {
    return `Режим ухода обновлён после перехода на стадию «${item.seedStage.toLowerCase()}».`;
  }
  const firstFactor = item.factors?.[0];
  if (firstFactor?.type === 'WEATHER') {
    return 'Из-за погоды режим пересчитан автоматически.';
  }
  if (firstFactor?.type === 'MANUAL') {
    return 'Пользователь изменил режим ухода вручную.';
  }
  if (firstFactor?.type === 'SEED_STAGE') {
    return firstFactor.impactText ?? 'Стадия роста повлияла на режим ухода.';
  }
  if (item.factors?.length) {
    return item.factors[0]?.impactText ?? item.summary ?? 'Причина изменения режима будет показана здесь.';
  }
  if (item.summary === 'Initial baseline' || item.summary === 'Seed baseline') {
    return item.seedStage ? 'Стартовый режим проращивания сохранён как отправная точка.' : 'Стартовый режим ухода сохранён как отправная точка.';
  }
  return item.summary ?? 'Причина изменения режима будет показана здесь.';
}

function historyTitle(item?: RecommendationHistoryItemDto | null): string {
  if (!item) {
    return 'История режима появится после первого заметного изменения.';
  }
  if (item.eventType === 'INITIAL_RECOMMENDATION_APPLIED') {
    return item.seedStage ? 'Стартовый режим проращивания сохранён' : 'Исходный режим сохранён';
  }
  if (item.eventType === 'MIGRATED_FROM_SEED') {
    return 'Растение переведено из режима проращивания';
  }
  if (item.eventType === 'SEED_STAGE_CHANGE' && item.seedStage) {
    return `Стадия изменилась: ${item.seedStage.toLowerCase()}`;
  }
  if (item.eventType === 'MANUAL_RECOMMENDATION_APPLIED' || item.eventType === 'MANUAL_OVERRIDE_APPLIED') {
    if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
      return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
    }
    if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
      return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
    }
    return 'Режим обновлён вручную';
  }
  if (item.eventType === 'WEATHER_DRIVEN_CHANGE') {
    if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
      return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
    }
    if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
      return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
    }
    return 'Режим обновлён из-за погоды';
  }
  if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
    return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
  }
  if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
    return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
  }
  return item.summary ?? 'Режим ухода обновлён';
}

function historySignificanceLabel(value?: string | null): string | null {
  const normalized = (value ?? '').toUpperCase();
  switch (normalized) {
    case 'MAJOR':
      return 'Важное';
    case 'MODERATE':
      return 'Заметное';
    case 'MINOR':
      return 'Небольшое';
    case 'INFO_ONLY':
      return 'Справка';
    default:
      return null;
  }
}

function historyEventLabel(item?: RecommendationHistoryItemDto | null): string | null {
  const normalized = (item?.eventType ?? '').toUpperCase();
  switch (normalized) {
    case 'INITIAL_RECOMMENDATION_APPLIED':
      return 'Старт';
    case 'MANUAL_RECOMMENDATION_APPLIED':
      return 'Вручную';
    case 'MANUAL_OVERRIDE_APPLIED':
      return 'Ручной режим';
    case 'MANUAL_OVERRIDE_REMOVED':
      return 'Авто режим';
    case 'WEATHER_DRIVEN_CHANGE':
      return 'Погода';
    case 'SEASONAL_CHANGE':
      return 'Сезон';
    case 'SEED_STAGE_CHANGE':
      return 'Стадия';
    case 'MIGRATED_FROM_SEED':
      return 'Переход';
    default:
      return historySourceBadge(item);
  }
}

function factorLabelTone(type?: string | null): string {
  const normalized = (type ?? '').toUpperCase();
  switch (normalized) {
    case 'WEATHER':
      return 'theme-badge-info';
    case 'MANUAL':
      return 'theme-badge-warning';
    case 'AI':
      return 'theme-badge-success';
    case 'SEED_STAGE':
    case 'GROWTH_STAGE':
      return 'theme-badge-success';
    default:
      return 'theme-surface-subtle';
  }
}

function dedupeHistoryItems(items: RecommendationHistoryItemDto[] | undefined): RecommendationHistoryItemDto[] {
  const source = items ?? [];
  const result: RecommendationHistoryItemDto[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const key = [
      item.eventType ?? '',
      item.summary ?? '',
      item.previousIntervalDays ?? '',
      item.newIntervalDays ?? '',
      item.previousWaterMl ?? '',
      item.newWaterMl ?? ''
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function PlantDetailSheet() {
  const queryClient = useQueryClient();
  const selectedPlantId = useUiStore((s) => s.selectedPlantId);
  const closePlantDetail = useUiStore((s) => s.closePlantDetail);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteShake, setDeleteShake] = useState(false);
  const [wateringPulse, setWateringPulse] = useState(0);
  const [migrationName, setMigrationName] = useState('');
  const [migrationInterval, setMigrationInterval] = useState('4');
  const [migrationWater, setMigrationWater] = useState('220');
  const [migrationPotVolume, setMigrationPotVolume] = useState('2');
  const [migrationContainerType, setMigrationContainerType] = useState<'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND'>('POT');
  const [migrationGrowthStage, setMigrationGrowthStage] = useState<'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST'>('SEEDLING');
  const [migrationGreenhouse, setMigrationGreenhouse] = useState(false);
  const [migrationMulched, setMigrationMulched] = useState(false);
  const [migrationDrip, setMigrationDrip] = useState(false);
  const [migrationSoilType, setMigrationSoilType] = useState<'SANDY' | 'LOAMY' | 'CLAY'>('LOAMY');
  const [migrationSunExposure, setMigrationSunExposure] = useState<'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE'>('PARTIAL_SHADE');
  const [migrationAreaM2, setMigrationAreaM2] = useState('0.25');
  const [migrationWizardOpen, setMigrationWizardOpen] = useState(false);
  const [migrationWizardStep, setMigrationWizardStep] = useState(0);

  const plantQuery = useQuery({
    queryKey: ['plant', selectedPlantId],
    queryFn: () => getPlantById(selectedPlantId as number),
    enabled: selectedPlantId !== null
  });

  const careAdviceQuery = useQuery({
    queryKey: ['plant-care-advice', selectedPlantId],
    queryFn: () => getPlantCareAdvice(selectedPlantId as number),
    enabled: selectedPlantId !== null && plantQuery.data?.wateringProfile !== 'SEED_START',
    staleTime: 60_000,
    retry: 1
  });

  const recommendationQuery = useQuery({
    queryKey: ['plant-watering-recommendation', selectedPlantId],
    queryFn: () => apiFetch<WateringRecommendationPreviewDto>(`/api/watering/recommendation/${selectedPlantId}/refresh`, {
      method: 'POST'
    }),
    enabled: selectedPlantId !== null && plantQuery.data?.wateringProfile !== 'SEED_START',
    staleTime: 60_000,
    retry: 1
  });

  const historyQuery = useQuery({
    queryKey: ['plant-recommendation-history', selectedPlantId, recommendationQuery.dataUpdatedAt ?? 0],
    queryFn: () => getRecommendationHistory(selectedPlantId as number, { view: 'compact', limit: 5 }),
    enabled: selectedPlantId !== null && (plantQuery.data?.wateringProfile === 'SEED_START' || recommendationQuery.isFetched),
    staleTime: 60_000,
    retry: 1
  });

  const migrationPreviewQuery = useQuery({
    queryKey: ['seed-migration-preview', selectedPlantId],
    queryFn: () => previewSeedMigration(selectedPlantId as number),
    enabled: selectedPlantId !== null && plantQuery.data?.wateringProfile === 'SEED_START',
    staleTime: 60_000,
    retry: 1
  });

  const applyManualRecommendationMutation = useMutation({
    mutationFn: ({ plantId, intervalDays, waterMl }: { plantId: number; intervalDays: number; waterMl: number }) =>
      apiFetch(`/api/watering/recommendation/${plantId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          source: 'MANUAL',
          recommendedIntervalDays: intervalDays,
          recommendedWaterMl: waterMl,
          summary: 'Ручная настройка из карточки растения.'
        })
      }),
    onSuccess: async () => {
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-watering-recommendation', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-recommendation-history', selectedPlantId] });
    },
    onError: () => hapticError()
  });

  const refreshAdviceMutation = useMutation({
    mutationFn: (id: number) => getPlantCareAdvice(id, true),
    onSuccess: (data, id) => {
      queryClient.setQueryData(['plant-care-advice', id], data);
    },
    onError: () => {
      hapticError();
    }
  });

  const waterMutation = useMutation({
    mutationFn: (id: number) => waterPlant(id),
    onSuccess: (updatedPlant) => {
      hapticSuccess();
      queryClient.setQueryData<CalendarEventDto[]>(['calendar'], (current) => updateCalendarAfterWatering(current, updatedPlant));
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['plant-recommendation-history', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant-care-advice', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant-watering-recommendation', selectedPlantId] });
    },
    onError: () => {
      hapticError();
    }
  });

  const seedStageMutation = useMutation({
    mutationFn: ({ plantId, seedStage }: { plantId: number; seedStage: NonNullable<PlantDto['seedStage']> }) =>
      updateSeedStage(plantId, seedStage),
    onMutate: async ({ plantId, seedStage }) => {
      await queryClient.cancelQueries({ queryKey: ['plant', plantId] });
      await queryClient.cancelQueries({ queryKey: ['plants'] });
      const previousPlant = queryClient.getQueryData<PlantDto>(['plant', plantId]);
      const previousPlants = queryClient.getQueryData<PlantDto[]>(['plants']);
      updatePlantCaches(queryClient, plantId, (plant) => ({ ...plant, seedStage }));
      return { previousPlant, previousPlants, plantId };
    },
    onSuccess: async () => {
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['seed-migration-preview', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-recommendation-history', selectedPlantId] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPlant) {
        queryClient.setQueryData(['plant', context.plantId], context.previousPlant);
      }
      if (context?.previousPlants) {
        queryClient.setQueryData(['plants'], context.previousPlants);
      }
      hapticError();
    }
  });

  const seedActionMutation = useMutation({
    mutationFn: ({ plantId, action }: { plantId: number; action: 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT' }) =>
      recordSeedCareAction(plantId, action),
    onMutate: async ({ plantId, action }) => {
      await queryClient.cancelQueries({ queryKey: ['plant', plantId] });
      await queryClient.cancelQueries({ queryKey: ['plants'] });
      const previousPlant = queryClient.getQueryData<PlantDto>(['plant', plantId]);
      const previousPlants = queryClient.getQueryData<PlantDto[]>(['plants']);
      updatePlantCaches(queryClient, plantId, (plant) => appendSeedActionEntry(plant, action));
      return { previousPlant, previousPlants, plantId };
    },
    onSuccess: async () => {
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-recommendation-history', selectedPlantId] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPlant) {
        queryClient.setQueryData(['plant', context.plantId], context.previousPlant);
      }
      if (context?.previousPlants) {
        queryClient.setQueryData(['plants'], context.previousPlants);
      }
      hapticError();
    }
  });

  const seedMigrationMutation = useMutation({
    mutationFn: ({ plantId, payload }: { plantId: number; payload: Record<string, unknown> }) =>
      migrateSeedPlant(plantId, payload),
    onSuccess: async () => {
      hapticSuccess();
      setMigrationWizardOpen(false);
      setMigrationWizardStep(0);
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['seed-migration-preview', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-recommendation-history', selectedPlantId] });
    },
    onError: () => hapticError()
  });

  const photoMutation = useMutation({
    mutationFn: ({ id, dataUrl }: { id: number; dataUrl: string }) => uploadPlantPhoto(id, dataUrl),
    onSuccess: () => {
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant-care-advice', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticError()
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePlant(id),
    onSuccess: () => {
      hapticSuccess();
      setDeleteConfirmOpen(false);
      closePlantDetail();
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => hapticError()
  });

  const plant = useMemo(() => plantQuery.data ?? null, [plantQuery.data]);
  const isSeedPlant = plant?.wateringProfile === 'SEED_START' || plant?.category === 'SEED_START';
  const isOverdue = useMemo(() => (plant ? getIsOverdue(plant) : false), [plant]);

  const adviceSource = careAdviceQuery.data?.source ?? null;
  const adviceText = normalizeAdviceText(careAdviceQuery.data);
  const hasAiAdvice = Boolean(adviceSource?.toLowerCase().startsWith('openrouter:') && adviceText);
  const recommendationState = recommendationUiState(
    recommendationQuery.isLoading && !recommendationQuery.data,
    recommendationQuery.isError && !recommendationQuery.data,
    recommendationQuery.data
  );

  useEffect(() => {
    if (selectedPlantId === null) {
      setPreviewDataUrl(null);
      setDeleteConfirmOpen(false);
      setDeleteShake(false);
      setWateringPulse(0);
    }
  }, [selectedPlantId]);

  useEffect(() => {
    const current = plantQuery.data;
    if (!current) {
      return;
    }
    setMigrationWizardStep(0);
    setMigrationName(current.name);
    setMigrationInterval(String(Math.max(1, current.baseIntervalDays ?? current.recommendedIntervalDays ?? 4)));
    setMigrationWater(String(Math.max(50, current.preferredWaterMl ?? current.recommendedWaterMl ?? 220)));
    setMigrationPotVolume(String(Math.max(0.3, current.potVolumeLiters ?? current.containerVolumeLiters ?? 2)));
    setMigrationContainerType((current.containerType as 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND') ?? 'POT');
    setMigrationGrowthStage((current.growthStage as 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST') ?? 'SEEDLING');
    setMigrationGreenhouse(Boolean(current.greenhouse));
    setMigrationMulched(Boolean(current.mulched));
    setMigrationDrip(Boolean(current.dripIrrigation));
    setMigrationSoilType((current.outdoorSoilType as 'SANDY' | 'LOAMY' | 'CLAY') ?? 'LOAMY');
    setMigrationSunExposure((current.sunExposure as 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE') ?? 'PARTIAL_SHADE');
    setMigrationAreaM2(String(Math.max(0.05, current.outdoorAreaM2 ?? 0.25)));
  }, [plantQuery.data]);

  const triggerWateringPulse = () => {
    setWateringPulse((prev) => prev + 1);
  };

  return (
    <BottomSheet open={selectedPlantId !== null} onClose={closePlantDetail}>
      {plantQuery.isLoading ? (
        <div className="py-6 text-center text-ios-subtext">Загружаем карточку растения...</div>
      ) : null}

      {plant ? (
        <>
          <PlantDetailPage
            plant={plant}
            previewDataUrl={previewDataUrl}
            photoUploading={photoMutation.isPending}
            wateringPulse={wateringPulse}
            mainSection={isSeedPlant ? {
              eyebrow: 'Сейчас',
              title: 'Стадия и действия',
              subtitle: 'Сначала самый понятный следующий шаг на текущем этапе.'
            } : undefined}
            explainabilitySection={isSeedPlant ? {
              eyebrow: 'Контекст',
              title: 'Что происходит сейчас',
              subtitle: 'Коротко о текущем режиме проращивания и рекомендациях.'
            } : undefined}
            secondarySection={isSeedPlant ? {
              eyebrow: 'Дополнительно',
              title: 'Рост, фото и переход',
              subtitle: 'История, камера роста и переход в обычное растение.'
            } : undefined}
            mainWatering={
              isSeedPlant ? (
                <SeedStageActionsCard
                  plant={plant}
                  loading={seedStageMutation.isPending || seedActionMutation.isPending}
                  migrationAllowed={Boolean(migrationPreviewQuery.data?.allowed && plant.targetEnvironmentType && plant.targetEnvironmentType !== 'SEED_START')}
                  recentActions={plant.seedActions ?? []}
                  onStageChange={(nextStage) => {
                    if (!selectedPlantId) return;
                    seedStageMutation.mutate({ plantId: selectedPlantId, seedStage: nextStage });
                  }}
                  onMigrate={() => {
                    setMigrationWizardStep(0);
                    setMigrationWizardOpen(true);
                  }}
                  onAction={(action) => {
                    if (!selectedPlantId) return;
                    seedActionMutation.mutate({ plantId: selectedPlantId, action });
                  }}
                />
              ) : (
                <WaterStatusBlock
                  plant={plant}
                  progress={getProgress(plant)}
                  isOverdue={isOverdue}
                  isLoading={waterMutation.isPending}
                  nextWateringDate={getNextDate(plant)}
                  recommendation={recommendationQuery.data ?? null}
                  onWater={async () => {
                    if (!selectedPlantId) return;
                    await waterMutation.mutateAsync(selectedPlantId);
                    triggerWateringPulse();
                  }}
                />
              )
            }
            explainability={
              isSeedPlant ? (
                <div className="space-y-4">
                  <SeedStatusBlock plant={plant} />
                  <SeedRecommendationSection plant={plant} />
                </div>
              ) : (
                <WateringRecommendationCard
                  plant={plant}
                  state={recommendationState}
                  recommendation={recommendationQuery.data ?? null}
                  loading={recommendationQuery.isFetching}
                  onRefresh={() => {
                    if (!selectedPlantId || recommendationQuery.isFetching) {
                      return;
                    }
                    impactLight();
                    void recommendationQuery.refetch();
                  }}
                  onManualApply={(intervalDays, waterMl) => {
                    if (!selectedPlantId || applyManualRecommendationMutation.isPending) {
                      return;
                    }
                    applyManualRecommendationMutation.mutate({
                      plantId: selectedPlantId,
                      intervalDays,
                      waterMl
                    });
                  }}
                  manualApplying={applyManualRecommendationMutation.isPending}
                />
              )
            }
            secondary={
              isSeedPlant ? (
                <div className="space-y-4">
                  {plant.seedStage !== 'READY_TO_TRANSPLANT' ? (
                    <SeedMigrationSection
                      plant={plant}
                      preview={migrationPreviewQuery.data ?? null}
                      loading={seedMigrationMutation.isPending}
                      onOpenWizard={() => {
                        setMigrationWizardStep(0);
                        setMigrationWizardOpen(true);
                      }}
                    />
                  ) : null}

                  <SeedMigrationWizard
                    open={migrationWizardOpen}
                    onOpenChange={(open) => {
                      if (seedMigrationMutation.isPending) {
                        return;
                      }
                      setMigrationWizardOpen(open);
                      if (!open) {
                        setMigrationWizardStep(0);
                      }
                    }}
                    step={migrationWizardStep}
                    onStepChange={setMigrationWizardStep}
                    plant={plant}
                    preview={migrationPreviewQuery.data ?? null}
                    loading={seedMigrationMutation.isPending}
                    form={{
                      migrationName,
                      migrationInterval,
                      migrationWater,
                      migrationPotVolume,
                      migrationContainerType,
                      migrationGrowthStage,
                      migrationGreenhouse,
                      migrationMulched,
                      migrationDrip,
                      migrationSoilType,
                      migrationSunExposure,
                      migrationAreaM2
                    }}
                    onChange={{
                      setMigrationName,
                      setMigrationInterval,
                      setMigrationWater,
                      setMigrationPotVolume,
                      setMigrationContainerType,
                      setMigrationGrowthStage,
                      setMigrationGreenhouse,
                      setMigrationMulched,
                      setMigrationDrip,
                      setMigrationSoilType,
                      setMigrationSunExposure,
                      setMigrationAreaM2
                    }}
                    onApply={() => {
                      if (!selectedPlantId) {
                        return;
                      }
                      const target = plant.targetEnvironmentType;
                      if (!target || target === 'SEED_START') {
                        hapticError();
                        return;
                      }
                      seedMigrationMutation.mutate({
                        plantId: selectedPlantId,
                        payload: {
                          targetEnvironmentType: target,
                          name: migrationName.trim() || plant.name,
                          baseIntervalDays: Math.max(1, Number(migrationInterval) || 4),
                          preferredWaterMl: Math.max(50, Number(migrationWater) || 220),
                          potVolumeLiters: target === 'INDOOR' || target === 'OUTDOOR_ORNAMENTAL'
                            ? Math.max(0.3, Number(migrationPotVolume) || 2)
                            : 1,
                          placement: target === 'INDOOR' ? 'INDOOR' : 'OUTDOOR',
                          containerType: target === 'INDOOR'
                            ? 'POT'
                            : target === 'OUTDOOR_ORNAMENTAL'
                              ? migrationContainerType
                              : 'OPEN_GROUND',
                          containerVolumeLiters: target === 'OUTDOOR_ORNAMENTAL' && migrationContainerType !== 'OPEN_GROUND'
                            ? Math.max(0.3, Number(migrationPotVolume) || 2)
                            : null,
                          cropType: target === 'OUTDOOR_GARDEN' ? (migrationName.trim() || plant.name) : null,
                          growthStage: target === 'OUTDOOR_GARDEN' ? migrationGrowthStage : null,
                          greenhouse: target === 'OUTDOOR_GARDEN' ? migrationGreenhouse : null,
                          dripIrrigation: target === 'OUTDOOR_GARDEN' ? migrationDrip : null,
                          outdoorAreaM2: target === 'OUTDOOR_GARDEN' ? Math.max(0.05, Number(migrationAreaM2) || 0.25) : null,
                          outdoorSoilType: target !== 'INDOOR' ? migrationSoilType : null,
                          sunExposure: target !== 'INDOOR' ? migrationSunExposure : null,
                          mulched: target === 'OUTDOOR_GARDEN' ? migrationMulched : target === 'OUTDOOR_ORNAMENTAL' ? false : null,
                          perennial: target === 'OUTDOOR_ORNAMENTAL',
                          winterDormancyEnabled: target === 'OUTDOOR_ORNAMENTAL',
                          region: plant.region ?? null,
                          type: 'DEFAULT'
                        }
                      });
                    }}
                  />
                  <RecommendationHistorySection
                    plant={plant}
                    recommendation={null}
                    history={historyQuery.data ?? null}
                    loading={historyQuery.isLoading && !historyQuery.data}
                    error={historyQuery.isError && !historyQuery.data}
                  />
                  <GrowthCarousel plantId={plant.id} currentPhotoUrl={plant.photoUrl} />

                  <DangerZoneSection
                    onDeleteClick={() => {
                      impactMedium();
                      setDeleteConfirmOpen(true);
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <GrowthCarousel plantId={plant.id} currentPhotoUrl={plant.photoUrl} />

                  <AIAdviceCard
                    loading={careAdviceQuery.isLoading && !careAdviceQuery.data}
                    refreshing={refreshAdviceMutation.isPending || careAdviceQuery.isFetching}
                    error={careAdviceQuery.isError && !careAdviceQuery.data}
                    refreshError={refreshAdviceMutation.isError}
                    hasAiAdvice={hasAiAdvice}
                    advice={adviceText}
                    source={adviceSource}
                    onRefresh={() => {
                      if (!selectedPlantId || refreshAdviceMutation.isPending) {
                        return;
                      }
                      impactLight();
                      refreshAdviceMutation.mutate(selectedPlantId);
                    }}
                  />

                  <RecommendationHistorySection
                    plant={plant}
                    recommendation={recommendationQuery.data ?? null}
                    history={historyQuery.data ?? null}
                    loading={historyQuery.isLoading && !historyQuery.data}
                    error={historyQuery.isError && !historyQuery.data}
                  />

                  <LeafDiagnosis plant={plant} />

                  <DangerZoneSection
                    onDeleteClick={() => {
                      impactMedium();
                      setDeleteConfirmOpen(true);
                    }}
                  />
                </div>
              )
            }
            onPickPhoto={async (file) => {
              if (!selectedPlantId) {
                return;
              }
              impactMedium();
              const dataUrl = await toDataUrl(file);
              setPreviewDataUrl(dataUrl);
              photoMutation.mutate({ id: selectedPlantId, dataUrl });
            }}
          >
          </PlantDetailPage>

          <Dialog
            open={deleteConfirmOpen}
            onOpenChange={(open) => {
              if (deleteMutation.isPending) {
                return;
              }
              setDeleteConfirmOpen(open);
            }}
            title="Удалить растение?"
            description="Это действие нельзя отменить. История роста и фото также будут удалены."
          >
            <motion.div
              animate={deleteShake ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.36, ease: 'easeInOut' }}
              onAnimationComplete={() => {
                if (deleteShake) {
                  setDeleteShake(false);
                }
              }}
            >
              <div className="theme-surface-danger mb-4 rounded-2xl border p-3 text-xs">
                <p className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  После удаления восстановить растение из приложения нельзя.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteMutation.isPending}
                >
                  Отмена
                </Button>
                <Button
                  className="border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:brightness-[0.98]"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!selectedPlantId) {
                      return;
                    }
                    impactHeavy();
                    setDeleteShake(true);
                    deleteMutation.mutate(selectedPlantId);
                  }}
                >
                  {deleteMutation.isPending ? 'Удаляем...' : 'Удалить навсегда'}
                </Button>
              </div>
            </motion.div>
          </Dialog>
        </>
      ) : null}
    </BottomSheet>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function WaterStatusBlock({
  plant,
  progress,
  nextWateringDate,
  isOverdue,
  isLoading,
  recommendation,
  onWater
}: {
  plant: PlantDto;
  progress: number;
  nextWateringDate: Date;
  isOverdue: boolean;
  isLoading: boolean;
  recommendation: WateringRecommendationPreviewDto | null;
  onWater: () => Promise<void> | void;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rawDaysLeft = Math.ceil((nextWateringDate.getTime() - today.getTime()) / 86_400_000);
  const daysLeft = Math.max(0, rawDaysLeft);
  const status = getPlantStatusTone(rawDaysLeft, plant.recommendationSource);
  const source = getPlantSourceTone(recommendation?.source ?? plant.recommendationSource);
  const SourceIcon = source.icon;
  const intervalDays = Math.max(
    1,
    recommendation?.recommendedIntervalDays ?? plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 7
  );
  const waterMl = Math.max(50, recommendation?.recommendedWaterMl ?? plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 250);
  const wateringMode = recommendation?.wateringMode ?? (plant.placement === 'OUTDOOR' ? 'WEATHER_GUIDED' : 'STANDARD');
  const nextLabel = isOverdue ? 'Сегодня без запаса' : daysLeft === 0 ? 'Полив сегодня' : daysLeft === 1 ? 'Полив завтра' : `Через ${daysLeft} дн.`;
  const weatherHint = recommendation?.weatherContextPreview?.available
    ? [
        recommendation.weatherContextPreview.temperatureNowC != null
          ? `${Math.round(recommendation.weatherContextPreview.temperatureNowC)}°C`
          : null,
        recommendation.weatherContextPreview.precipitationForecastMm != null
          ? `осадки ${recommendation.weatherContextPreview.precipitationForecastMm} мм`
          : null,
        recommendation.weatherContextPreview.humidityNowPercent != null
          ? `влажность ${Math.round(recommendation.weatherContextPreview.humidityNowPercent)}%`
          : null
      ].filter(Boolean).join(' · ')
    : null;
  const indoorHint = [
    plant.potVolumeLiters != null ? `горшок ${plant.potVolumeLiters.toFixed(1)} л` : null,
    humanizeWateringProfile(plant.wateringProfile) ? `профиль ${humanizeWateringProfile(plant.wateringProfile)}` : null,
    plant.baseIntervalDays ? `база ${plant.baseIntervalDays} дн.` : null
  ].filter(Boolean).join(' · ');
  const wateredToday = hasWateredToday(plant);

  return (
    <section className={`theme-surface-1 space-y-4 rounded-3xl border p-4 shadow-sm backdrop-blur-ios ${status.borderClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Текущий режим полива</p>
          <p className="mt-1 text-lg font-semibold text-ios-text">
            {isOverdue ? 'Растению нужен полив сейчас' : nextLabel}
          </p>
          <p className="text-sm text-ios-subtext">
            Следующий полив: {nextWateringDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold ${status.containerClassName}`}>
            <span className={`mr-1.5 h-2 w-2 rounded-full ${status.dotClassName}`} />
            {status.label}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${source.className}`}>
            <SourceIcon className="h-3.5 w-3.5" />
            {source.shortLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Следующий полив</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{nextLabel}</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Интервал</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{intervalDays} дн.</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Объём</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{waterMl} мл</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Режим</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{humanizeWateringMode(wateringMode)}</p>
        </div>
      </div>

      <div className="theme-surface-subtle rounded-2xl border p-3">
        <p className="text-xs uppercase tracking-[0.14em] text-ios-subtext">
          {plant.placement === 'OUTDOOR' ? 'Уличные акценты' : 'Домашние акценты'}
        </p>
        <p className="mt-2 text-sm leading-5 text-ios-text">
          {plant.placement === 'OUTDOOR'
            ? weatherHint || `участок ${plant.containerType?.toLowerCase() ?? 'на улице'} · ${plant.sunExposure?.toLowerCase() ?? 'свет не указан'} · ${plant.outdoorSoilType?.toLowerCase() ?? 'почва не указана'}`
            : indoorHint || 'умеренный домашний режим с опорой на базовый профиль'}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-ios-subtext">
          <span>Прогресс цикла</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ios-border/40">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isOverdue ? 'bg-red-400 dark:bg-red-500' : 'bg-emerald-500 dark:bg-emerald-400'
            }`}
            style={{ width: `${Math.max(8, Math.round(progress))}%` }}
          />
        </div>
      </div>

      <QuickWaterButton
        isLoading={isLoading}
        isOverdue={isOverdue}
        disabled={wateredToday}
        disabledLabel="Сегодня уже отмечено"
        onWater={onWater}
        onSuccess={() => undefined}
      />

      {wateredToday ? (
        <p className="text-xs text-ios-subtext">Полив уже отмечен сегодня. Повторное нажатие не изменит график.</p>
      ) : null}

      <p className="text-xs text-ios-subtext">
        Источник рекомендации показан честно: ручной режим и резервный сценарий не маскируются под AI.
      </p>
    </section>
  );
}

function seedStageLabel(stage?: PlantDto['seedStage'] | null): string {
  switch (stage) {
    case 'SOWN':
      return 'Посеяно';
    case 'GERMINATING':
      return 'Прорастает';
    case 'SPROUTED':
      return 'Появились всходы';
    case 'SEEDLING':
      return 'Сеянец';
    case 'READY_TO_TRANSPLANT':
      return 'Готово к пересадке';
    default:
      return 'Проращивание семян';
  }
}

function targetEnvironmentLabel(target?: PlantDto['targetEnvironmentType'] | null): string {
  switch (target) {
    case 'INDOOR':
      return 'Домашнее растение';
    case 'OUTDOOR_ORNAMENTAL':
      return 'Уличное декоративное';
    case 'OUTDOOR_GARDEN':
      return 'Уличное садовое';
    case 'SEED_START':
      return 'Проращивание семян';
    default:
      return 'Не выбрано';
  }
}

function seedWateringModeLabel(mode?: PlantDto['recommendedWateringMode'] | null): string {
  switch (mode) {
    case 'MIST':
      return 'Лёгкое опрыскивание';
    case 'BOTTOM_WATER':
      return 'Нижний полив';
    case 'KEEP_COVERED':
      return 'Поддерживать под крышкой';
    case 'VENT_AND_MIST':
      return 'Проветривать и опрыскивать';
    case 'LIGHT_SURFACE_WATER':
      return 'Лёгкое увлажнение сверху';
    case 'CHECK_ONLY':
      return 'Только контроль';
    default:
      return 'Не задано';
  }
}

function seedSourceLabel(source?: string | null): string {
  switch (source) {
    case 'AI':
      return 'AI';
    case 'FALLBACK':
      return 'Резервный режим';
    case 'MANUAL':
      return 'Вручную';
    case 'SEED':
      return 'Базовый режим';
    default:
      return source?.trim() || 'Базовый режим';
  }
}

function seedDaysSinceSowing(plant: PlantDto): number | null {
  if (!plant.sowingDate) {
    return null;
  }
  const sowing = startOfLocalDay(parseDateOnly(plant.sowingDate));
  const today = startOfLocalDay(new Date());
  return Math.max(0, Math.floor((today.getTime() - sowing.getTime()) / 86_400_000));
}

function SeedStatusBlock({ plant }: { plant: PlantDto }) {
  const daysSinceSowing = seedDaysSinceSowing(plant);
  const windowLabel = plant.expectedGerminationDaysMin != null && plant.expectedGerminationDaysMax != null
    ? `${plant.expectedGerminationDaysMin}-${plant.expectedGerminationDaysMax} дн.`
    : 'ещё не рассчитано';

  return (
    <section className="theme-surface-1 space-y-4 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Режим проращивания</p>
          <p className="mt-1 text-lg font-semibold text-ios-text">{seedStageLabel(plant.seedStage)}</p>
          <p className="text-sm text-ios-subtext">Цель: {targetEnvironmentLabel(plant.targetEnvironmentType)}</p>
        </div>
        <span className="theme-badge-info rounded-full px-3 py-1 text-xs font-semibold">
          {seedSourceLabel(plant.seedCareSource)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">После посева</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{daysSinceSowing != null ? `${daysSinceSowing} дн.` : '—'}</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Проверка</p>
          <p className="mt-1 text-base font-semibold text-ios-text">
            {plant.recommendedCheckIntervalHours ? `каждые ${plant.recommendedCheckIntervalHours} ч` : 'по ситуации'}
          </p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Всходы</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{windowLabel}</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Увлажнение</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{seedWateringModeLabel(plant.recommendedWateringMode)}</p>
        </div>
      </div>

      <div className="theme-surface-subtle rounded-2xl border p-3">
        <p className="text-sm leading-5 text-ios-text">
          {plant.seedSummary?.trim() || 'Для семян важнее стабильная влажность, контроль стадии и постепенный переход к обычному растению.'}
        </p>
      </div>
    </section>
  );
}

function SeedRecommendationSection({ plant }: { plant: PlantDto }) {
  const reasoning = plant.seedReasoning ?? [];
  const warnings = plant.seedWarnings ?? [];

  return (
    <section className="theme-surface-1 space-y-3 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ios-text">Режим наблюдения и увлажнения</p>
          <p className="text-xs text-ios-subtext">Рекомендации для семян не сводятся к «мл каждые N дней».</p>
        </div>
        <span className="theme-badge-success rounded-full px-2.5 py-1 text-[11px]">
          {seedWateringModeLabel(plant.recommendedWateringMode)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Режим ухода</p>
          <p className="mt-1 text-sm font-medium text-ios-text">{plant.seedCareMode ?? 'Следить за влажностью и стадией роста'}</p>
        </div>
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs text-ios-subtext">Условия</p>
          <p className="mt-1 text-sm font-medium text-ios-text">
            {plant.underCover ? 'Под укрытием' : 'Без укрытия'} · {plant.growLight ? 'есть досветка' : 'без досветки'}
          </p>
        </div>
      </div>

      {reasoning.length ? (
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Почему такой режим</p>
          <ul className="mt-2 space-y-1 text-sm text-ios-text">
            {reasoning.map((item, idx) => (
              <li key={`${item}-${idx}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="theme-surface-warning rounded-2xl border p-3">
          <p className="theme-text-warning text-xs font-semibold uppercase tracking-[0.14em]">Важные замечания</p>
          <ul className="mt-2 space-y-1 text-sm text-ios-text">
            {warnings.map((item, idx) => (
              <li key={`${item}-${idx}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SeedLifecycleSection({
  plant,
  migrationPreview,
  stageLoading,
  actionLoading,
  onStageChange,
  onAction
}: {
  plant: PlantDto;
  migrationPreview: { allowed: boolean; message: string } | null;
  stageLoading: boolean;
  actionLoading: boolean;
  onStageChange: (stage: NonNullable<PlantDto['seedStage']>) => void;
  onAction: (action: 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT') => void;
}) {
  const stageOptions: Array<{ value: NonNullable<PlantDto['seedStage']>; label: string }> = [
    { value: 'SOWN', label: 'Посеяно' },
    { value: 'GERMINATING', label: 'Прорастает' },
    { value: 'SPROUTED', label: 'Всходы' },
    { value: 'SEEDLING', label: 'Сеянец' },
    { value: 'READY_TO_TRANSPLANT', label: 'К пересадке' }
  ];
  const actions: Array<{ key: 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT'; label: string }> = [
    { key: 'MOISTEN', label: 'Увлажнить' },
    { key: 'VENT', label: 'Проветрить' },
    { key: 'REMOVE_COVER', label: 'Снять крышку' },
    { key: 'MOVE_TO_LIGHT', label: 'Под свет' },
    { key: 'PRICK_OUT', label: 'Пикировать' }
  ];

  return (
    <section className="theme-surface-1 space-y-3 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div>
        <p className="text-sm font-semibold text-ios-text">Стадия и действия</p>
        <p className="mt-1 text-xs text-ios-subtext">{migrationPreview?.message ?? 'Отмечайте реальные действия, чтобы не терять контекст роста.'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {stageOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={plant.seedStage === option.value ? 'default' : 'secondary'}
            className="h-10 rounded-full px-3 text-xs"
            disabled={stageLoading}
            onClick={() => onStageChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="secondary"
            className="h-10 rounded-2xl text-xs"
            disabled={actionLoading}
            onClick={() => onAction(action.key)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {(plant.seedActions ?? []).length ? (
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Последние действия</p>
          <ul className="mt-2 space-y-1 text-sm text-ios-text">
            {(plant.seedActions ?? []).slice(0, 5).map((item, idx) => (
              <li key={`${item}-${idx}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SeedMigrationSection({
  plant,
  preview,
  loading,
  onOpenWizard
}: {
  plant: PlantDto;
  preview: {
    allowed: boolean;
    targetLabel: string;
    message: string;
  } | null;
  loading: boolean;
  onOpenWizard: () => void;
}) {
  const target = plant.targetEnvironmentType;
  const canApply = Boolean(preview?.allowed && target && target !== 'SEED_START');

  return (
    <section className="theme-surface-1 space-y-3 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div>
        <p className="text-sm font-semibold text-ios-text">Перевести в растение</p>
        <p className="mt-1 text-xs text-ios-subtext">
          {preview?.message ?? 'Когда всходы окрепнут, посев можно перевести в обычный режим растения.'}
        </p>
      </div>

      <div className="theme-surface-subtle rounded-2xl border p-3 text-sm text-ios-text">
        Целевая категория: <b>{preview?.targetLabel ?? targetEnvironmentLabel(target)}</b>
      </div>

      <div className="theme-surface-subtle rounded-2xl border p-3 text-sm text-ios-subtext">
        Мастер перевода откроется отдельным шагом: сначала проверим цель, потом уточним параметры нового режима и только после этого применим миграцию.
      </div>

      <Button type="button" className="h-11 w-full rounded-2xl" disabled={!canApply || loading} onClick={onOpenWizard}>
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Переводим...
          </span>
        ) : 'Открыть мастер перевода'}
      </Button>
    </section>
  );
}

function SeedMigrationWizard({
  open,
  onOpenChange,
  step,
  onStepChange,
  plant,
  preview,
  loading,
  form,
  onChange,
  onApply
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: number;
  onStepChange: (step: number) => void;
  plant: PlantDto;
  preview: {
    allowed: boolean;
    targetLabel: string;
    message: string;
  } | null;
  loading: boolean;
  form: {
    migrationName: string;
    migrationInterval: string;
    migrationWater: string;
    migrationPotVolume: string;
    migrationContainerType: 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND';
    migrationGrowthStage: 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST';
    migrationGreenhouse: boolean;
    migrationMulched: boolean;
    migrationDrip: boolean;
    migrationSoilType: 'SANDY' | 'LOAMY' | 'CLAY';
    migrationSunExposure: 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE';
    migrationAreaM2: string;
  };
  onChange: {
    setMigrationName: (value: string) => void;
    setMigrationInterval: (value: string) => void;
    setMigrationWater: (value: string) => void;
    setMigrationPotVolume: (value: string) => void;
    setMigrationContainerType: (value: 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND') => void;
    setMigrationGrowthStage: (value: 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST') => void;
    setMigrationGreenhouse: (value: boolean) => void;
    setMigrationMulched: (value: boolean) => void;
    setMigrationDrip: (value: boolean) => void;
    setMigrationSoilType: (value: 'SANDY' | 'LOAMY' | 'CLAY') => void;
    setMigrationSunExposure: (value: 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE') => void;
    setMigrationAreaM2: (value: string) => void;
  };
  onApply: () => void;
}) {
  const target = plant.targetEnvironmentType;
  const canApply = Boolean(preview?.allowed && target && target !== 'SEED_START');
  const totalSteps = target === 'INDOOR' ? 2 : 3;
  const atLastStep = step >= totalSteps - 1;
  const hasTarget = Boolean(target && target !== 'SEED_START');
  const targetAccent = (() => {
    switch (target) {
      case 'INDOOR':
        return {
          icon: Leaf,
          eyebrow: 'Дом',
          className: 'theme-badge-success'
        };
      case 'OUTDOOR_ORNAMENTAL':
        return {
          icon: Trees,
          eyebrow: 'Декор',
          className: 'theme-badge-info'
        };
      case 'OUTDOOR_GARDEN':
        return {
          icon: Warehouse,
          eyebrow: 'Сад',
          className: 'theme-badge-warning'
        };
      default:
        return {
          icon: Sprout,
          eyebrow: 'Переход',
          className: 'theme-surface-subtle'
        };
    }
  })();
  const targetSummary = (() => {
    switch (target) {
      case 'INDOOR':
        return {
          title: 'Домашний режим',
          description: 'Фокус на ритме полива, объёме горшка и спокойном indoor-уходе без seed-логики.'
        };
      case 'OUTDOOR_ORNAMENTAL':
        return {
          title: 'Уличный декоративный режим',
          description: 'Важно уточнить контейнер, свет и почву, чтобы после перевода рекомендации учитывали наружные условия.'
        };
      case 'OUTDOOR_GARDEN':
        return {
          title: 'Садовый режим',
          description: 'После перевода начнут работать параметры культуры: стадия роста, площадь, почва и сезонные условия.'
        };
      default:
        return {
          title: 'Новая категория',
          description: 'Подготовим короткий перевод из seed-flow в обычный режим растения.'
        };
    }
  })();

  const canProceed = (() => {
    if (!hasTarget) {
      return false;
    }
    if (step === 0) {
      return Boolean(form.migrationName.trim()) && Number(form.migrationInterval) > 0 && Number(form.migrationWater) > 0;
    }
    if (step === 1 && target !== 'INDOOR') {
      if (target === 'OUTDOOR_ORNAMENTAL') {
        return Boolean(form.migrationContainerType) && Boolean(form.migrationSoilType) && Boolean(form.migrationSunExposure);
      }
      return Number(form.migrationAreaM2) > 0 && Boolean(form.migrationSoilType) && Boolean(form.migrationSunExposure);
    }
    return true;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Мастер перевода в растение"
      description="Небольшой укороченный flow: уточняем параметры нового режима и только потом завершаем миграцию."
      className="md:w-[min(92vw,560px)]"
    >
      <div className="space-y-4">
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${targetAccent.className}`}>
          <targetAccent.icon className="h-3.5 w-3.5" />
          {targetAccent.eyebrow}
        </div>

        <div className="theme-surface-subtle rounded-2xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-ios-subtext">Шаг {Math.min(step + 1, totalSteps)} из {totalSteps}</p>
              <p className="mt-1 text-sm font-semibold text-ios-text">
                {step === 0
                  ? 'База перевода'
                  : step === 1 && target !== 'INDOOR'
                    ? 'Условия новой категории'
                    : 'Подтверждение'}
              </p>
            </div>
            <div className="text-right text-xs text-ios-subtext">
              <div>Из: {seedStageLabel(plant.seedStage)}</div>
              <div>В: {preview?.targetLabel ?? targetEnvironmentLabel(target)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              'База',
              target === 'INDOOR' ? 'Подтверждение' : 'Условия',
              target === 'INDOOR' ? 'Готово' : 'Подтверждение'
            ].map((label, index) => {
              const isActive = index === step;
              const isDone = index < step;
              const hidden = target === 'INDOOR' && index === 2;
              if (hidden) {
                return null;
              }
              return (
                <div
                  key={label}
                  className={`rounded-2xl border px-3 py-2 text-center text-xs font-medium ${
                    isActive
                      ? 'theme-pill-active'
                      : isDone
                        ? 'theme-surface-subtle border-emerald-400/40 text-ios-text'
                        : 'theme-surface-subtle text-ios-subtext'
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="theme-surface-subtle rounded-2xl border p-3">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-2xl p-2 ${targetAccent.className}`}>
              <targetAccent.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-ios-subtext">{targetSummary.title}</p>
              <p className="mt-1 text-sm leading-5 text-ios-text">{targetSummary.description}</p>
            </div>
          </div>
        </div>

        {step === 0 ? (
          <div className="space-y-3">
            <div className="theme-surface-subtle rounded-2xl border p-3 text-sm leading-5 text-ios-text">
              {preview?.message ?? 'Готовим перевод из режима проращивания в обычный plant-flow.'}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Название после перевода">
                <input
                  value={form.migrationName}
                  onChange={(e) => onChange.setMigrationName(e.target.value)}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                  placeholder="Название"
                />
              </Field>
              <Field label="Интервал полива (дней)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.migrationInterval}
                  onChange={(e) => onChange.setMigrationInterval(e.target.value)}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                  placeholder="Интервал"
                />
              </Field>
              <Field label="Объём полива (мл)">
                <input
                  type="number"
                  min={50}
                  max={10000}
                  value={form.migrationWater}
                  onChange={(e) => onChange.setMigrationWater(e.target.value)}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                  placeholder="Вода мл"
                />
              </Field>
              {target === 'INDOOR' || target === 'OUTDOOR_ORNAMENTAL' ? (
                <Field label="Объём ёмкости (л)">
                  <input
                    type="number"
                    min={0.3}
                    step={0.1}
                    value={form.migrationPotVolume}
                    onChange={(e) => onChange.setMigrationPotVolume(e.target.value)}
                    className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                    placeholder="Объём л"
                  />
                </Field>
              ) : (
                <Field label="Площадь посадки (м²)">
                  <input
                    type="number"
                    min={0.05}
                    step={0.01}
                    value={form.migrationAreaM2}
                    onChange={(e) => onChange.setMigrationAreaM2(e.target.value)}
                    className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                    placeholder="Площадь м²"
                  />
                </Field>
              )}
            </div>
          </div>
        ) : null}

        {step === 1 && target === 'OUTDOOR_ORNAMENTAL' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Где растёт">
                <select
                  value={form.migrationContainerType}
                  onChange={(e) => onChange.setMigrationContainerType(e.target.value as 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="POT">Кашпо</option>
                  <option value="CONTAINER">Контейнер</option>
                  <option value="FLOWERBED">Клумба</option>
                  <option value="OPEN_GROUND">Грунт</option>
                </select>
              </Field>
              <Field label="Почва">
                <select
                  value={form.migrationSoilType}
                  onChange={(e) => onChange.setMigrationSoilType(e.target.value as 'SANDY' | 'LOAMY' | 'CLAY')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="LOAMY">Суглинистая</option>
                  <option value="SANDY">Песчаная</option>
                  <option value="CLAY">Глинистая</option>
                </select>
              </Field>
              <Field label="Освещение">
                <select
                  value={form.migrationSunExposure}
                  onChange={(e) => onChange.setMigrationSunExposure(e.target.value as 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="FULL_SUN">Солнце</option>
                  <option value="PARTIAL_SHADE">Полутень</option>
                  <option value="SHADE">Тень</option>
                </select>
              </Field>
            </div>
          </div>
        ) : null}

        {step === 1 && target === 'OUTDOOR_GARDEN' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Стадия роста">
                <select
                  value={form.migrationGrowthStage}
                  onChange={(e) => onChange.setMigrationGrowthStage(e.target.value as 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="SEEDLING">Рассада</option>
                  <option value="VEGETATIVE">Вегетация</option>
                  <option value="FLOWERING">Цветение</option>
                  <option value="FRUITING">Плодоношение</option>
                  <option value="HARVEST">Перед сбором</option>
                </select>
              </Field>
              <Field label="Почва">
                <select
                  value={form.migrationSoilType}
                  onChange={(e) => onChange.setMigrationSoilType(e.target.value as 'SANDY' | 'LOAMY' | 'CLAY')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="LOAMY">Суглинистая</option>
                  <option value="SANDY">Песчаная</option>
                  <option value="CLAY">Глинистая</option>
                </select>
              </Field>
              <Field label="Освещение">
                <select
                  value={form.migrationSunExposure}
                  onChange={(e) => onChange.setMigrationSunExposure(e.target.value as 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE')}
                  className="theme-field h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="FULL_SUN">Солнце</option>
                  <option value="PARTIAL_SHADE">Полутень</option>
                  <option value="SHADE">Тень</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ToggleChip label="Теплица" checked={form.migrationGreenhouse} onChange={onChange.setMigrationGreenhouse} />
              <ToggleChip label="Мульча" checked={form.migrationMulched} onChange={onChange.setMigrationMulched} />
              <ToggleChip label="Капля" checked={form.migrationDrip} onChange={onChange.setMigrationDrip} />
            </div>
          </div>
        ) : null}

        {(step === totalSteps - 1) || (target === 'INDOOR' && step === 1) ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoChip label="Новое имя" value={form.migrationName || plant.name} />
              <InfoChip label="Цель" value={preview?.targetLabel ?? targetEnvironmentLabel(target)} />
              <InfoChip label="Интервал" value={`${Math.max(1, Number(form.migrationInterval) || 1)} дн.`} />
              <InfoChip label="Объём" value={`${Math.max(50, Number(form.migrationWater) || 50)} мл`} />
            </div>
            <div className="theme-surface-subtle rounded-2xl border p-3 text-sm text-ios-subtext">
              <p className="leading-5">
                После подтверждения seed-режим отключится, а карточка сразу перейдёт в обычную категорию растения с новым профилем ухода.
              </p>
              <p className="mt-2 leading-5">
                Мы сохраняем имя, фото и накопленный контекст, чтобы переход ощущался как продолжение выращивания, а не как создание нового объекта с нуля.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            className="h-11 flex-1"
            disabled={loading}
            onClick={() => {
              if (step === 0) {
                onOpenChange(false);
                return;
              }
              onStepChange(Math.max(0, step - 1));
            }}
          >
            {step === 0 ? 'Закрыть' : 'Назад'}
          </Button>
          {atLastStep ? (
            <Button type="button" className="h-11 flex-1" disabled={!canApply || !canProceed || loading} onClick={onApply}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Переводим...
                </span>
              ) : 'Подтвердить перевод'}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={!canProceed}
              onClick={() => onStepChange(Math.min(totalSteps - 1, step + 1))}
            >
              Далее
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ToggleChip({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`h-10 rounded-xl border px-3 text-xs font-medium ${checked ? 'theme-pill-active' : 'theme-surface-subtle text-ios-text'}`}
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ios-subtext">{label}</span>
      {children}
    </label>
  );
}

function InfoChip({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="theme-surface-subtle rounded-2xl border p-3">
      <p className="text-xs text-ios-subtext">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ios-text">{value}</p>
    </div>
  );
}

function AIAdviceCard({
  loading,
  refreshing,
  error,
  refreshError,
  hasAiAdvice,
  advice,
  source,
  onRefresh
}: {
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  refreshError: boolean;
  hasAiAdvice: boolean;
  advice: string | null;
  source: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="theme-surface-1 space-y-3 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <div className="rounded-full bg-emerald-100/70 p-2 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
            <Leaf className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ios-text">AI советы</p>
            <p className="text-xs text-ios-subtext">Персональная рекомендация на сегодня</p>
          </div>
        </div>
        <Button type="button" variant="ghost" className="h-auto min-h-[44px] rounded-xl px-3 py-2 text-center text-xs leading-tight" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1 h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {loading ? (
        <div className="theme-surface-subtle space-y-2 rounded-2xl border p-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-full animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-ios-border/70" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="theme-surface-danger rounded-2xl border p-3 text-sm">
          <p className="theme-text-danger font-medium">Не удалось загрузить AI советы.</p>
          <p className="theme-text-danger mt-1 text-xs">Проверьте сеть и повторите запрос.</p>
          <Button type="button" variant="secondary" className="mt-3 h-auto min-h-[40px] rounded-xl px-3 py-2 text-center leading-tight" onClick={onRefresh}>
            Повторить
          </Button>
        </div>
      ) : null}

      {!loading && !error && hasAiAdvice && advice ? (
        <div className="theme-surface-success rounded-2xl border p-3">
          <p className="theme-text-success inline-flex items-center gap-1.5 text-xs font-medium">
            <Bot className="h-4 w-4" />
            Источник: {formatAiAdviceSource(source)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ios-text">{advice}</p>
        </div>
      ) : null}

      {!loading && !error && !hasAiAdvice ? (
        <div className="theme-surface-warning rounded-2xl border p-3">
          <p className="theme-text-warning inline-flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle className="h-4 w-4" />
            AI временно недоступен, показан базовый совет.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ios-text">
            {advice ?? 'Пока нет дополнительных рекомендаций. Попробуйте обновить позже.'}
          </p>
        </div>
      ) : null}

      {refreshError && !loading ? (
        <p className="theme-text-danger inline-flex items-center gap-1 text-xs">
          <Droplets className="h-3.5 w-3.5" />
          Не удалось обновить совет, попробуйте ещё раз.
        </p>
      ) : null}
    </section>
  );
}

function WateringRecommendationCard({
  plant,
  state,
  recommendation,
  loading,
  onRefresh,
  onManualApply,
  manualApplying
}: {
  plant: PlantDto;
  state: 'idle' | 'loading' | 'success' | 'fallback' | 'error';
  recommendation: WateringRecommendationPreviewDto | null;
  loading: boolean;
  onRefresh: () => void;
  onManualApply: (intervalDays: number, waterMl: number) => void;
  manualApplying: boolean;
}) {
  const [manualInterval, setManualInterval] = useState(String(Math.max(1, plant.baseIntervalDays ?? 7)));
  const [manualWaterMl, setManualWaterMl] = useState(String(Math.max(50, plant.preferredWaterMl ?? 250)));
  const [expanded, setExpanded] = useState(false);
  const badge = recommendationBadge(recommendation?.source ?? null);
  const sourceTone = getPlantSourceTone(recommendation?.source ?? plant.recommendationSource);
  const SourceIcon = sourceTone.icon;
  const explainability = buildExplainabilityViewModel({ plant, recommendation });
  const canRenderExplainability = Boolean(
    recommendation
      || explainability.summary.trim()
      || explainability.topFactors.length
      || explainability.warnings.length
  );

  useEffect(() => {
    if (!recommendation) return;
    if (recommendation.recommendedIntervalDays) {
      setManualInterval(String(recommendation.recommendedIntervalDays));
    }
    if (recommendation.recommendedWaterMl) {
      setManualWaterMl(String(recommendation.recommendedWaterMl));
    }
  }, [recommendation?.recommendedIntervalDays, recommendation?.recommendedWaterMl]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="theme-surface-1 space-y-3 rounded-3xl border p-4 shadow-sm backdrop-blur-ios"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ios-text">Почему такой режим</p>
          <p className="text-xs text-ios-subtext">Короткое объяснение логики рекомендации</p>
        </div>
        <div className="inline-flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sourceTone.className}`}>
            <SourceIcon className="h-3.5 w-3.5" />
            {sourceTone.shortLabel}
          </span>
          <Button type="button" variant="ghost" className="h-auto min-h-[44px] rounded-xl px-3 py-2 text-center text-xs leading-tight" disabled={loading} onClick={onRefresh}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1 h-4 w-4" />}
            Обновить
          </Button>
        </div>
      </div>

      {state === 'idle' ? (
        <div className="theme-surface-subtle rounded-2xl border p-3 text-sm text-ios-subtext">
          Нажмите «Обновить», чтобы получить актуальную рекомендацию.
        </div>
      ) : null}

      {state === 'loading' ? (
        <div className="theme-surface-subtle space-y-2 rounded-2xl border p-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-full animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-ios-border/70" />
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="theme-surface-danger rounded-2xl border p-3 text-sm">
          <p className="theme-text-danger font-medium">Не удалось получить рекомендацию.</p>
          <p className="theme-text-danger mt-1 text-xs">Проверьте сеть и повторите запрос.</p>
          <Button type="button" variant="secondary" className="mt-3 h-auto min-h-[40px] rounded-xl px-3 py-2 text-center leading-tight" onClick={onRefresh}>
            Повторить
          </Button>
        </div>
      ) : null}

      {canRenderExplainability && state !== 'loading' ? (
        <div className={`rounded-2xl border p-3 ${
          state === 'fallback' || explainability.mode === 'FALLBACK'
            ? 'theme-surface-warning'
            : 'theme-surface-success'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm leading-5 text-ios-text">{explainability.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ios-subtext">
                {explainability.topFactors.map((item, idx) => (
                  <span key={`${item}-${idx}`} className="theme-surface-subtle rounded-full border border-current/20 px-2 py-0.5">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sourceTone.className}`}>
              <SourceIcon className="h-3.5 w-3.5" />
              {sourceTone.shortLabel}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ios-subtext">
            <div className="flex flex-wrap gap-2">
              <span className="theme-surface-subtle rounded-full border border-current/20 px-2 py-0.5">
                Источник: {badge}
              </span>
              <span className="theme-surface-subtle rounded-full border border-current/20 px-2 py-0.5">
                Режим: {humanizeWateringMode(recommendation?.wateringMode)}
              </span>
            </div>
            <button
              type="button"
              className="theme-surface-subtle inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-current/20 px-3 text-[11px] font-semibold text-ios-text"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Скрыть детали' : 'Показать детали'}
            </button>
          </div>

          {expanded ? (
            <div className="mt-3 space-y-3">
              <div className="theme-surface-subtle rounded-xl border border-current/15 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Кратко</p>
                <p className="mt-2 text-sm leading-5 text-ios-text">{explainability.summary}</p>
              </div>

              {recommendation?.reasoning?.length ? (
                <div className="theme-surface-subtle rounded-xl border border-current/15 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Почему режим такой</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ios-text">
                    {recommendation.reasoning.slice(0, 6).map((item, idx) => (
                      <li key={`${item}-${idx}`} className="leading-5">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {explainability.allFactors.length ? (
                <div className="theme-surface-subtle rounded-xl border border-current/15 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Что влияет</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {explainability.allFactors.slice(0, 6).map((item, idx) => (
                      <span
                        key={`${item}-${idx}`}
                        className="theme-surface-subtle rounded-full border border-current/20 px-2.5 py-1 text-[11px] text-ios-text"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {explainability.warnings.length ? (
                <div className="theme-surface-warning rounded-xl border p-3">
                  <p className="theme-text-warning text-xs font-semibold uppercase tracking-[0.14em]">Важные замечания</p>
                  <ul className="mt-2 space-y-1 text-sm text-ios-text">
                    {explainability.warnings.slice(0, 6).map((item, idx) => (
                      <li key={`${item}-${idx}`} className="leading-5">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="theme-surface-subtle rounded-2xl border p-3">
        <p className="text-xs font-medium text-ios-text">Ручная настройка</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            min={1}
            max={60}
            value={manualInterval}
            onChange={(e) => setManualInterval(e.target.value)}
            className="theme-field h-10 rounded-xl border px-3 text-sm"
            placeholder="Интервал"
          />
          <input
            type="number"
            min={50}
            max={10000}
            step={50}
            value={manualWaterMl}
            onChange={(e) => setManualWaterMl(e.target.value)}
            className="theme-field h-10 rounded-xl border px-3 text-sm"
            placeholder="Объём мл"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 h-10 w-full rounded-xl"
          disabled={manualApplying}
          onClick={() => {
            const interval = Math.max(1, Math.min(60, Number(manualInterval) || 7));
            const waterMl = Math.max(50, Math.min(10000, Number(manualWaterMl) || 250));
            onManualApply(interval, waterMl);
          }}
        >
          {manualApplying ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Применяем...
            </span>
          ) : 'Применить вручную'}
        </Button>
      </div>
    </motion.section>
  );
}

function DangerZoneSection({ onDeleteClick }: { onDeleteClick: () => void }) {
  return (
    <section className="theme-surface-1 rounded-3xl border p-4">
      <p className="text-sm font-semibold text-ios-text">Управление растением</p>
      <p className="mt-1 text-xs text-ios-subtext">
        Редкое действие. Удаление стирает растение, фото роста и связанную историю.
      </p>
      <Button
        type="button"
        variant="ghost"
        className="theme-surface-danger theme-text-danger mt-3 h-11 w-full rounded-2xl border px-3 hover:bg-[hsl(var(--destructive)/0.16)]"
        onClick={onDeleteClick}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Удалить растение
      </Button>
    </section>
  );
}

function RecommendationHistorySection({
  plant,
  recommendation,
  history,
  loading,
  error
}: {
  plant: PlantDto;
  recommendation: WateringRecommendationPreviewDto | null;
  history: RecommendationHistoryResponseDto | null;
  loading: boolean;
  error: boolean;
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const dedupedItems = dedupeHistoryItems(history?.items);
  const latest = dedupedItems[0] ?? history?.latestVisibleChange ?? null;
  const previewItems = dedupedItems.slice(1, 3);
  const fallbackUpdatedAt = formatRecommendationMoment(plant.recommendationGeneratedAt);
  const fallbackSummary = recommendation?.summary?.trim() || plant.recommendationSummary?.trim() || 'История режима появится после первого заметного изменения.';
  const fallbackSource = recommendationBadge(recommendation?.source ?? plant.recommendationSource ?? null);
  const timelineQuery = useQuery({
    queryKey: ['plant-recommendation-history-full', plant.id, timelineOpen],
    queryFn: () => getRecommendationHistory(plant.id, { view: 'full', limit: 20 }),
    enabled: timelineOpen,
    staleTime: 60_000,
    retry: 1
  });
  const timelineItems = dedupeHistoryItems(timelineQuery.data?.items);

  return (
    <section className="theme-surface-1 rounded-3xl border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ios-text">История рекомендаций</p>
          <p className="mt-1 text-xs text-ios-subtext">
            Последние заметные изменения режима: что поменялось, когда и почему.
          </p>
        </div>
        <span className="rounded-full border border-ios-border/60 px-2.5 py-1 text-[11px] text-ios-subtext">
          {latest ? historySourceBadge(latest) : fallbackSource}
        </span>
      </div>

      {loading ? <p className="mt-3 text-sm text-ios-subtext">Собираем историю режима...</p> : null}
      {error ? <p className="theme-banner-danger mt-3 rounded-2xl border px-3 py-2 text-xs">Не удалось загрузить историю режима.</p> : null}

      {!loading && !error ? (
        <>
          <div className="theme-surface-subtle mt-3 rounded-2xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-ios-subtext">
                  {latest ? 'Последнее изменение' : 'Пока без истории'}
                </p>
                <p className="mt-2 text-sm font-semibold leading-5 text-ios-text">
                  {latest ? historyTitle(latest) : fallbackSummary}
                </p>
                <p className="mt-2 text-sm leading-5 text-ios-subtext">
                  {latest ? historyReasonLine(latest) : 'Когда режим изменится автоматически или вы примените его вручную, здесь появится понятная хроника изменений.'}
                </p>
              </div>
              {latest && historyDeltaLabel(latest) ? (
                <span className="theme-badge-info shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                  {historyDeltaLabel(latest)}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ios-subtext">
              {latest ? (
                <>
                  <span className="rounded-full border border-ios-border/55 px-2 py-1">
                    {formatRecommendationMoment(latest.occurredAt) ?? 'Недавно'}
                  </span>
                  {latest.newIntervalDays != null ? (
                    <span className="rounded-full border border-ios-border/55 px-2 py-1">
                      {latest.newIntervalDays} дн.
                    </span>
                  ) : null}
                  {latest.newWaterMl != null ? (
                    <span className="rounded-full border border-ios-border/55 px-2 py-1">
                      {latest.newWaterMl} мл
                    </span>
                  ) : null}
                  {latest.factors.slice(0, 2).map((factor) => (
                    <span key={`${latest.id}-${factor.type}`} className="rounded-full border border-ios-border/55 px-2 py-1">
                      {factor.label}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <span className="rounded-full border border-ios-border/55 px-2 py-1">
                    Интервал: {plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 7} дн.
                  </span>
                  <span className="rounded-full border border-ios-border/55 px-2 py-1">
                    Объём: {plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 250} мл
                  </span>
                  {fallbackUpdatedAt ? (
                    <span className="rounded-full border border-ios-border/55 px-2 py-1">Обновлено: {fallbackUpdatedAt}</span>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {previewItems.length ? (
            <div className="mt-3 space-y-2">
              {previewItems.map((item) => (
                <div key={item.id} className="theme-surface-subtle rounded-2xl border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-ios-text">{historyTitle(item)}</p>
                    <span className="shrink-0 text-[11px] text-ios-subtext">
                      {formatRecommendationMoment(item.occurredAt) ?? 'Недавно'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ios-subtext">{historyReasonLine(item)}</p>
                </div>
              ))}
            </div>
          ) : null}

          {dedupedItems.length ? (
            <button
              type="button"
              className="theme-surface-subtle mt-3 inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium text-ios-text"
              onClick={() => setTimelineOpen(true)}
            >
              Показать историю
            </button>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        title="История режима"
        description="Хроника изменений полива: что поменялось, почему и было ли это автоматически или вручную."
      >
        {timelineQuery.isLoading ? <p className="text-sm text-ios-subtext">Собираем полную историю…</p> : null}
        {timelineQuery.isError ? <p className="theme-banner-danger rounded-2xl border px-3 py-3 text-sm">Не удалось загрузить полную историю режима.</p> : null}
        {!timelineQuery.isLoading && !timelineQuery.isError ? (
          timelineItems.length ? (
            <div className="space-y-3">
              {timelineItems.map((item) => (
                <div key={`timeline-${item.id}`} className="theme-surface-subtle rounded-3xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-ios-text">{historyTitle(item)}</p>
                      <p className="mt-1 text-xs text-ios-subtext">{formatRecommendationMoment(item.occurredAt) ?? 'Недавно'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full border border-ios-border/55 px-2.5 py-1 text-[11px] text-ios-subtext">
                        {historyEventLabel(item)}
                      </span>
                      {historySignificanceLabel(item.changeSignificance) ? (
                        <span className="rounded-full border border-ios-border/55 px-2.5 py-1 text-[11px] text-ios-subtext">
                          {historySignificanceLabel(item.changeSignificance)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-5 text-ios-text">{item.summary ?? 'Режим ухода обновлён.'}</p>
                  <p className="mt-2 text-sm leading-5 text-ios-subtext">{historyReasonLine(item)}</p>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ios-subtext">
                    {item.previousIntervalDays != null && item.newIntervalDays != null ? (
                      <span className="rounded-full border border-ios-border/55 px-2 py-1">
                        {item.previousIntervalDays} → {item.newIntervalDays} дн.
                      </span>
                    ) : null}
                    {item.previousWaterMl != null && item.newWaterMl != null ? (
                      <span className="rounded-full border border-ios-border/55 px-2 py-1">
                        {item.previousWaterMl} → {item.newWaterMl} мл
                      </span>
                    ) : null}
                    {item.manualOverrideActive != null ? (
                      <span className="rounded-full border border-ios-border/55 px-2 py-1">
                        {item.manualOverrideActive ? 'Ручной режим активен' : 'Авто режим активен'}
                      </span>
                    ) : null}
                    {item.userActionRequired ? (
                      <span className="theme-badge-warning rounded-full px-2 py-1 text-[11px] font-semibold">
                        Нужна проверка
                      </span>
                    ) : null}
                  </div>

                  {item.factors.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-ios-subtext">Что повлияло</p>
                      {item.factors.map((factor) => (
                        <div key={`${item.id}-${factor.type}-${factor.label}`} className="rounded-2xl border border-ios-border/50 px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className={`${factorLabelTone(factor.type)} rounded-full px-2 py-0.5 text-[10px] font-semibold`}>
                              {factor.label}
                            </span>
                            <p className="min-w-0 text-xs leading-5 text-ios-subtext">
                              {factor.impactText}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {item.warnings.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-ios-subtext">Важно</p>
                      {item.warnings.map((warning, index) => (
                        <p key={`${item.id}-warning-${index}`} className="theme-banner-warning rounded-2xl border px-3 py-2 text-xs">
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ios-subtext">История режима пока пуста.</p>
          )
        ) : null}
      </Dialog>
    </section>
  );
}
