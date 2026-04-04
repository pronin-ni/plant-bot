import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Droplets, FileText, Leaf, Loader2, Plus, RefreshCcw, Sprout, Trash2, Trees, Warehouse } from 'lucide-react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { Dialog } from '@/components/ui/dialog';
import { PlantDetailPage } from '@/app/PlantDetail/PlantDetailPage';
import { SeedDetailPage } from '@/app/PlantDetail/SeedDetailPage';
import { GrowthCarousel } from '@/components/GrowthCarousel';
import { GrowthTimeline } from '@/app/PlantDetail/GrowthTimeline';
import { LeafDiagnosis } from '@/components/LeafDiagnosis';
import { NotesList } from '@/components/NotesList';
import { AddNoteSheet } from '@/components/AddNoteSheet';
import { SeedStageActionsCard } from '@/components/seed/SeedStageActionsCard';
import { createSeedActionEntry, formatSeedActionEntry } from '@/components/seed/seedStageUi';
import { getPlantSourceTone, getPlantStatusTone } from '@/components/plants/plantRecommendationUi';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import { Button } from '@/components/ui/button';
import {
  apiFetch,
  createPlantNote,
  deletePlant,
  deletePlantNote,
  getPlantById,
  getPlantCareAdvice,
  getPlantNotes,
  getRecommendationHistory,
  migrateSeedPlant,
  previewSeedMigration,
  recordSeedCareAction,
  updatePlant,
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
  CreateNoteRequest,
  PlantCareAdviceDto,
  PlantDto,
  PlantNoteDto,
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
  const nextActions = [createSeedActionEntry(action), ...(plant.seedActions ?? [])].slice(0, 20);
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
  if (source.toLowerCase().startsWith('openai_compatible:') || source.toLowerCase().startsWith('openai:')) {
    return 'AI через OpenAI-compatible';
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
  if (source.includes('REFRESH')) return 'Автоматически';
  if (source.includes('CREATE')) return item?.manualOverrideActive ? 'Вручную' : 'Старт';
  return item.manualOverrideActive ? 'Вручную' : 'Авто';
}

function historyLooksManual(item?: RecommendationHistoryItemDto | null): boolean {
  if (!item) return false;
  return Boolean(item.manualOverrideActive) || (item.currentSource ?? '').toUpperCase().includes('MANUAL');
}

function historyLooksWeatherDriven(item?: RecommendationHistoryItemDto | null): boolean {
  if (!item) return false;
  return Boolean(item.factors?.some((factor) => factor.type === 'WEATHER'))
    || Boolean(item.weatherContribution)
    || (item.currentSource ?? '').toUpperCase().includes('WEATHER');
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
    if (historyLooksManual(item)) {
      return 'Ручной режим сейчас активен и сохранён как текущий.';
    }
    if (historyLooksWeatherDriven(item)) {
      return 'Режим подтверждён с учётом погоды.';
    }
    return item.seedStage ? 'Стартовый режим проращивания сохранён как отправная точка.' : 'Стартовый режим ухода сохранён как отправная точка.';
  }
  if (item.eventType === 'MIGRATED_FROM_SEED') {
    return 'После выхода из режима проращивания растение перешло к обычной логике ухода.';
  }
  if (item.eventType === 'MANUAL_RECOMMENDATION_APPLIED' || item.eventType === 'MANUAL_OVERRIDE_APPLIED') {
    return 'Пользователь изменил режим ухода вручную.';
  }
  if (item.eventType === 'MANUAL_OVERRIDE_REMOVED') {
    return 'Теперь снова работает автоматический режим.';
  }
  if (item.eventType === 'SEED_STAGE_CHANGE' && item.seedStage) {
    return `Режим обновлён после перехода на стадию «${seedStageLabel(item.seedStage as PlantDto['seedStage'])}».`;
  }
  const firstFactor = item.factors?.[0];
  if (firstFactor?.type === 'WEATHER') {
    return 'Из-за погоды режим обновился автоматически.';
  }
  if (firstFactor?.type === 'MANUAL') {
    return 'Пользователь изменил режим ухода вручную.';
  }
  if (firstFactor?.type === 'SEED_STAGE') {
    return firstFactor.impactText ?? 'Стадия роста повлияла на режим ухода.';
  }
  if (item.factors?.length) {
    return item.factors[0]?.impactText ?? item.summary ?? 'Здесь появится причина изменения режима.';
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
    if (historyLooksManual(item)) {
      return 'Ручной режим сохранён';
    }
    if (historyLooksWeatherDriven(item)) {
      return 'Режим подтверждён с учётом погоды';
    }
    return item.seedStage ? 'Сохранён стартовый режим проращивания' : 'Сохранён стартовый режим';
  }
  if (item.eventType === 'MIGRATED_FROM_SEED') {
    return 'Растение переведено из режима проращивания';
  }
  if (item.eventType === 'SEED_STAGE_CHANGE' && item.seedStage) {
    return `Стадия изменилась: ${seedStageLabel(item.seedStage as PlantDto['seedStage'])}`;
  }
  if (item.eventType === 'MANUAL_RECOMMENDATION_APPLIED' || item.eventType === 'MANUAL_OVERRIDE_APPLIED') {
    if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
      return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
    }
    if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
      return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
    }
    return 'Режим изменён вручную';
  }
  if (item.eventType === 'WEATHER_DRIVEN_CHANGE') {
    if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
      return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
    }
    if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
      return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
    }
    return 'Режим изменился из-за погоды';
  }
  if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
    return `Интервал изменился с ${item.previousIntervalDays} до ${item.newIntervalDays} дней`;
  }
  if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
    return `Объём изменился с ${item.previousWaterMl} до ${item.newWaterMl} мл`;
  }
  return item.summary ?? 'Режим ухода изменился';
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
      return 'Для справки';
    default:
      return null;
  }
}

function historyValueDiffs(item?: RecommendationHistoryItemDto | null): string[] {
  if (!item) return [];
  const diffs: string[] = [];
  if (item.previousIntervalDays != null && item.newIntervalDays != null && item.previousIntervalDays !== item.newIntervalDays) {
    diffs.push(`${item.previousIntervalDays} → ${item.newIntervalDays} дн.`);
  }
  if (item.previousWaterMl != null && item.newWaterMl != null && item.previousWaterMl !== item.newWaterMl) {
    diffs.push(`${item.previousWaterMl} → ${item.newWaterMl} мл`);
  }
  return diffs;
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
      return 'Автоматически';
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
  const [manualEditOpen, setManualEditOpen] = useState(false);

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

  const notesQuery = useQuery({
    queryKey: ['plant-notes', selectedPlantId],
    queryFn: () => getPlantNotes(selectedPlantId as number),
    enabled: selectedPlantId !== null,
    staleTime: 30_000,
    retry: 1
  });

  const [addNoteOpen, setAddNoteOpen] = useState(false);

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

  const updatePlantMutation = useMutation({
    mutationFn: ({ plantId, potVolumeLiters, preferredWaterMl, baseIntervalDays }: { 
      plantId: number; 
      potVolumeLiters?: number;
      preferredWaterMl?: number;
      baseIntervalDays?: number;
    }) =>
      updatePlant(plantId, { potVolumeLiters, preferredWaterMl, baseIntervalDays }),
    onMutate: async ({ plantId, potVolumeLiters, preferredWaterMl, baseIntervalDays }) => {
      await queryClient.cancelQueries({ queryKey: ['plant', plantId] });
      const previousPlant = queryClient.getQueryData<PlantDto>(['plant', plantId]);
      queryClient.setQueryData<PlantDto>(['plant', plantId], (current) => {
        if (!current) return current;
        return {
          ...current,
          ...(potVolumeLiters !== undefined && { potVolumeLiters }),
          ...(preferredWaterMl !== undefined && { preferredWaterMl }),
          ...(baseIntervalDays !== undefined && { baseIntervalDays })
        };
      });
      return { previousPlant };
    },
    onSuccess: async () => {
      hapticSuccess();
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-watering-recommendation', selectedPlantId] });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPlant) {
        queryClient.setQueryData(['plant', context.previousPlant.id], context.previousPlant);
      }
      hapticError();
    }
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

  const createNoteMutation = useMutation({
    mutationFn: (payload: CreateNoteRequest) => createPlantNote(selectedPlantId as number, payload),
    onSuccess: () => {
      hapticSuccess();
      setAddNoteOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['plant-notes', selectedPlantId] });
    },
    onError: () => hapticError()
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deletePlantNote(selectedPlantId as number, noteId),
    onSuccess: () => {
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: ['plant-notes', selectedPlantId] });
    },
    onError: () => hapticError()
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
  const hasAiAdvice = Boolean(
    adviceText && adviceSource && /^(openrouter|openai):/i.test(adviceSource)
  );
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

  useEffect(() => {
    if (selectedPlantId !== null) {
      document.body.classList.add('sheet-open');
    } else {
      document.body.classList.remove('sheet-open');
    }
    return () => {
      document.body.classList.remove('sheet-open');
    };
  }, [selectedPlantId]);

  const notes = notesQuery.data ?? [];
  const formattedSeedActions = (plant?.seedActions ?? []).map(formatSeedActionEntry);
  const latestSeedHistory = dedupeHistoryItems(historyQuery.data?.items).slice(0, 4);

  return (
    <BottomSheet open={selectedPlantId !== null} onClose={closePlantDetail}>
      {plantQuery.isLoading ? (
        <div className="py-6 text-center text-ios-subtext">Загружаем карточку растения...</div>
      ) : null}

      {plant ? (
        <>
          {isSeedPlant ? (
            <>
              <SeedDetailPage
                plant={plant}
                previewDataUrl={previewDataUrl}
                photoUploading={photoMutation.isPending}
                onPickPhoto={async (file) => {
                  if (!selectedPlantId) {
                    return;
                  }
                  impactMedium();
                  const dataUrl = await toDataUrl(file);
                  setPreviewDataUrl(dataUrl);
                  photoMutation.mutate({ id: selectedPlantId, dataUrl });
                }}
                main={
                  <SeedStageActionsCard
                    plant={plant}
                    loading={seedStageMutation.isPending || seedActionMutation.isPending}
                    migrationAllowed={Boolean(migrationPreviewQuery.data?.allowed && plant.targetEnvironmentType && plant.targetEnvironmentType !== 'SEED_START')}
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
                }
                context={<SeedContextBlock plant={plant} />}
                secondary={(
                  <div className="space-y-4">
                    <SeedJournalBlock
                      notes={notes}
                      onAdd={() => setAddNoteOpen(true)}
                      onDelete={(noteId) => {
                        deleteNoteMutation.mutate(noteId);
                      }}
                    />

                    <SeedTrackingBlock
                      actionEvents={formattedSeedActions}
                      historyEvents={latestSeedHistory}
                      historyLoading={historyQuery.isLoading && !historyQuery.data}
                      historyError={historyQuery.isError && !historyQuery.data}
                    />

                    <GrowthTimeline plantId={plant.id} currentPhotoUrl={plant.photoUrl} />

                    <div className="space-y-4 rounded-[30px] border border-ios-border/60 bg-ios-card/50 p-3 backdrop-blur-ios">
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

                      <RecommendationHistorySection
                        plant={plant}
                        recommendation={null}
                        history={historyQuery.data ?? null}
                        loading={historyQuery.isLoading && !historyQuery.data}
                        error={historyQuery.isError && !historyQuery.data}
                      />
                    </div>

                    <DangerZoneSection
                      onDeleteClick={() => {
                        impactMedium();
                        setDeleteConfirmOpen(true);
                      }}
                    />
                  </div>
                )}
              />

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
            </>
          ) : (
            <PlantDetailPage
              plant={plant}
              previewDataUrl={previewDataUrl}
              photoUploading={photoMutation.isPending}
              wateringPulse={wateringPulse}
              mainWatering={
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
                  onOpenManualEdit={() => setManualEditOpen(true)}
                  onAiRecompute={() => {
                    if (!selectedPlantId || recommendationQuery.isFetching) return;
                    impactLight();
                    void recommendationQuery.refetch();
                  }}
                  isAiLoading={recommendationQuery.isFetching}
                />
              }
              explainability={
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
                />
              }
              secondary={
                <div className="space-y-4">
                  <AIAdviceCard
                    loading={careAdviceQuery.isLoading && !careAdviceQuery.data}
                    refreshing={refreshAdviceMutation.isPending || careAdviceQuery.isFetching}
                    error={careAdviceQuery.isError && !careAdviceQuery.data}
                    hasAiAdvice={hasAiAdvice}
                    advice={adviceText}
                    onRefresh={() => {
                      if (!selectedPlantId || refreshAdviceMutation.isPending) {
                        return;
                      }
                      impactLight();
                      refreshAdviceMutation.mutate(selectedPlantId);
                    }}
                  />

                  <CollapsibleSection
                    title="AI-диагностика"
                    icon={<Bot className="h-3.5 w-3.5 text-ios-accent" />}
                    defaultCollapsed={true}
                  >
                    <LeafDiagnosis plant={plant} />
                  </CollapsibleSection>

                  <div className="flex items-center justify-between rounded-2xl bg-ios-bg/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-ios-accent" />
                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-ios-subtext">Заметки</span>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full bg-ios-accent/10 px-3 py-1.5 text-xs font-medium text-ios-accent transition-colors active:bg-ios-accent/20"
                      onClick={() => setAddNoteOpen(true)}
                    >
                      <Plus className="h-3 w-3" />
                      Заметка
                    </button>
                  </div>

                  <CollapsibleSection
                    title="Записи"
                    icon={<FileText className="h-3.5 w-3.5 text-ios-accent" />}
                    defaultCollapsed={true}
                  >
                    {(() => {
                      const lastFeeding = notes.find((n) => n.type === 'FEEDING');
                      const daysSinceFeeding = lastFeeding
                        ? Math.floor((Date.now() - new Date(lastFeeding.createdAt).getTime()) / 86_400_000)
                        : null;

                      return (
                        <>
                          {daysSinceFeeding !== null ? (
                            <p className="mb-2 px-0.5 text-[11px] text-ios-subtext">
                              Подкормка: {daysSinceFeeding === 0 ? 'сегодня' : `${daysSinceFeeding} дн. назад`}
                            </p>
                          ) : null}

                          <NotesList
                            notes={notes}
                            onDelete={(noteId) => {
                              deleteNoteMutation.mutate(noteId);
                            }}
                          />
                        </>
                      );
                    })()}
                  </CollapsibleSection>

                  <DangerZoneSection
                    onDeleteClick={() => {
                      impactMedium();
                      setDeleteConfirmOpen(true);
                    }}
                  />
                </div>
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
              <>
                <GrowthTimeline plantId={plant.id} currentPhotoUrl={plant.photoUrl} />
                <RecommendationHistorySection
                  plant={plant}
                  recommendation={recommendationQuery.data ?? null}
                  history={historyQuery.data ?? null}
                  loading={historyQuery.isLoading && !historyQuery.data}
                  error={historyQuery.isError && !historyQuery.data}
                />
              </>
            </PlantDetailPage>
          )}

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

      <AddNoteSheet
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        saving={createNoteMutation.isPending}
        sheetTitle={isSeedPlant ? 'Добавить запись в журнал ухода' : 'Добавить заметку'}
        submitLabel={isSeedPlant ? 'Сохранить запись' : 'Сохранить'}
        noteTypeLabels={isSeedPlant ? {
          GENERAL: 'Наблюдение',
          FEEDING: 'Подкормка',
          ISSUE: 'Сигнал'
        } : undefined}
        placeholders={isSeedPlant ? {
          text: 'Например: появились первые всходы, снял крышку, перенёс под лампу...',
          issueText: 'Например: заметил плесень, грунт подсох, росток вытянулся...'
        } : undefined}
        onSave={(payload) => {
          createNoteMutation.mutate(payload);
        }}
      />

      <ManualEditSheet
        open={manualEditOpen}
        onClose={() => setManualEditOpen(false)}
        plant={plant ?? plantQuery.data!}
        isApplying={applyManualRecommendationMutation.isPending || updatePlantMutation.isPending}
        onApply={async (intervalDays, waterMl, potVolumeLiters) => {
          if (!selectedPlantId) {
            return;
          }
          try {
            await updatePlantMutation.mutateAsync({
              plantId: selectedPlantId,
              baseIntervalDays: intervalDays,
              preferredWaterMl: waterMl,
              potVolumeLiters: potVolumeLiters
            });
            await applyManualRecommendationMutation.mutateAsync({
              plantId: selectedPlantId,
              intervalDays,
              waterMl
            });
            setManualEditOpen(false);
          } catch {
            // Keep the sheet open so the user can retry after an error.
          }
        }}
      />
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
  onWater,
  onOpenManualEdit,
  onAiRecompute,
  isAiLoading
}: {
  plant: PlantDto;
  progress: number;
  nextWateringDate: Date;
  isOverdue: boolean;
  isLoading: boolean;
  recommendation: WateringRecommendationPreviewDto | null;
  onWater: () => Promise<void> | void;
  onOpenManualEdit?: () => void;
  onAiRecompute?: () => void;
  isAiLoading?: boolean;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rawDaysLeft = Math.ceil((nextWateringDate.getTime() - today.getTime()) / 86_400_000);
  const daysLeft = Math.max(0, rawDaysLeft);
  const intervalDays = Math.max(
    1,
    recommendation?.recommendedIntervalDays ?? plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 7
  );
  const waterMl = Math.max(50, recommendation?.recommendedWaterMl ?? plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 250);
  const wateringMode = recommendation?.wateringMode ?? (plant.placement === 'OUTDOOR' ? 'WEATHER_GUIDED' : 'STANDARD');
  const nextLabel = isOverdue ? 'Срочно' : daysLeft === 0 ? 'Сегодня' : daysLeft === 1 ? 'Завтра' : `${daysLeft} дн.`;
  const wateredToday = hasWateredToday(plant);
  
  const isManual = plant.recommendationSource === 'MANUAL';
  const sourceLabel = isManual ? 'Вручную' : 'AI + погода';
  const sourceColor = isManual ? 'text-ios-subtext' : 'text-emerald-500';

  return (
    <section className="theme-surface-1 space-y-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.15em] text-ios-subtext">Полив</p>
            <span className={`text-[10px] font-medium ${sourceColor}`}>{sourceLabel}</span>
          </div>
          <p className="mt-0.5 text-lg font-semibold text-ios-text">
            {isOverdue ? 'Нужен сейчас' : nextLabel}
          </p>
        </div>
        <div className="h-10 w-10 rounded-full bg-ios-surface-subtle flex items-center justify-center">
          <span className={`text-sm font-bold ${isOverdue ? 'text-red-500' : 'text-emerald-500'}`}>
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="theme-surface-subtle min-w-0 rounded-xl border p-2.5">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ios-subtext">Интервал</p>
          <p className="mt-0.5 break-words text-sm font-semibold text-ios-text">{intervalDays} дн.</p>
        </div>
        <div className="theme-surface-subtle min-w-0 rounded-xl border p-2.5">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ios-subtext">Объём</p>
          <p className="mt-0.5 break-words text-sm font-semibold text-ios-text">{waterMl} мл</p>
        </div>
        <div className="theme-surface-subtle min-w-0 rounded-xl border p-2.5">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ios-subtext">Режим</p>
          <p className="mt-0.5 break-words text-sm font-semibold leading-5 text-ios-text">{humanizeWateringMode(wateringMode)}</p>
        </div>
      </div>

      {plant?.potVolumeLiters ? (
        <p className="text-xs text-ios-subtext">
          Горшок {plant.potVolumeLiters.toFixed(1)} л · {plant.wateringProfile ? humanizeWateringProfile(plant.wateringProfile) : 'стандартный'}
        </p>
      ) : null}

      <QuickWaterButton
        isLoading={isLoading}
        isOverdue={isOverdue}
        disabled={wateredToday}
        disabledLabel={wateredToday ? 'Полито сегодня' : undefined}
        onWater={onWater}
        onSuccess={() => undefined}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 h-9 text-xs"
          onClick={onOpenManualEdit}
        >
          Ручной режим
        </Button>
        <Button
          type="button"
          variant="default"
          className="flex-1 h-9 text-xs gap-1.5"
          onClick={onAiRecompute}
          disabled={isAiLoading}
        >
          <Bot className="h-3.5 w-3.5" />
          {isAiLoading ? '...' : 'AI'}
        </Button>
      </div>
    </section>
  );
}

function ManualEditSheet({
  open,
  onClose,
  plant,
  onApply,
  isApplying
}: {
  open: boolean;
  onClose: () => void;
  plant: PlantDto;
  onApply: (intervalDays: number, waterMl: number, potVolumeLiters?: number) => void;
  isApplying: boolean;
}) {
  const [interval, setInterval] = useState('7');
  const [waterMl, setWaterMl] = useState('250');
  const [potVolume, setPotVolume] = useState('2');

  useEffect(() => {
    if (plant) {
      setInterval(String(plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 7));
      setWaterMl(String(plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 250));
      setPotVolume(String(plant.potVolumeLiters ?? 2));
    }
  }, [plant]);

  const handleApply = () => {
    const intervalNum = Math.max(1, Math.min(60, Number(interval) || 7));
    const waterMlNum = Math.max(50, Math.min(10000, Number(waterMl) || 250));
    const potVolumeNum = Math.max(0.1, Math.min(100, Number(potVolume) || 2));
    onApply(intervalNum, waterMlNum, potVolumeNum);
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-ios-text">Редактирование</h3>
          <p className="mt-1 text-sm text-ios-subtext">Укажите параметры полива</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ios-text">Горшок</label>
            <div className="relative">
              <input
                type="number"
                min={0.1}
                max={100}
                step="any"
                inputMode="decimal"
                value={potVolume}
                onChange={(e) => setPotVolume(e.target.value)}
                className="theme-field h-12 w-full rounded-xl border px-3 pr-8 text-center text-base"
                placeholder="2"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ios-subtext">л</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ios-text">Интервал</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={60}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="theme-field h-12 w-full rounded-xl border px-3 pr-8 text-center text-base"
                placeholder="7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ios-subtext">дн</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ios-text">Объём</label>
            <div className="relative">
              <input
                type="number"
                min={50}
                max={10000}
                step={50}
                value={waterMl}
                onChange={(e) => setWaterMl(e.target.value)}
                className="theme-field h-12 w-full rounded-xl border px-3 pr-8 text-center text-base"
                placeholder="250"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ios-subtext">мл</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="h-12 flex-1"
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            type="button"
            className="h-12 flex-1"
            disabled={isApplying}
            onClick={handleApply}
          >
            {isApplying ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : 'Применить'}
          </Button>
        </div>
      </div>
    </BottomSheet>
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

function humanizeSeedSentence(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  const withSpaces = normalized
    .replaceAll('MIST_AND_BOTTOM_WATER', 'мягкое увлажнение и нижний полив')
    .replaceAll('KEEP_COVERED', 'режим под крышкой')
    .replaceAll('VENT_AND_MIST', 'мягкое проветривание и лёгкое увлажнение')
    .replaceAll('LIGHT_SURFACE_WATER', 'лёгкое увлажнение верхнего слоя')
    .replaceAll('CHECK_ONLY', 'режим наблюдения без лишнего полива');

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function SeedContextBlock({ plant }: { plant: PlantDto }) {
  const daysSinceSowing = seedDaysSinceSowing(plant);
  const windowLabel = plant.expectedGerminationDaysMin != null && plant.expectedGerminationDaysMax != null
    ? `${plant.expectedGerminationDaysMin}-${plant.expectedGerminationDaysMax} дней`
    : 'окно всходов ещё не рассчитано';
  const reasoning = (plant.seedReasoning ?? []).slice(0, 3);
  const warnings = (plant.seedWarnings ?? []).slice(0, 2);
  const conditions = [
    plant.underCover ? 'Под крышкой' : 'Без крышки',
    plant.growLight ? 'Под дополнительным светом' : 'Без досветки',
    plant.recommendedCheckIntervalHours ? `Проверка каждые ${plant.recommendedCheckIntervalHours} ч` : 'Проверка по состоянию'
  ];

  return (
    <section className="theme-surface-1 space-y-4 rounded-[30px] border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Текущий режим</p>
          <p className="mt-1 text-lg font-semibold text-ios-text">{seedWateringModeLabel(plant.recommendedWateringMode)}</p>
          <p className="text-sm text-ios-subtext">{plant.seedCareMode ?? 'Спокойный контроль влажности и стадии роста'}</p>
        </div>
        <span className="theme-badge-info rounded-full px-3 py-1 text-xs font-semibold">
          {seedSourceLabel(plant.seedCareSource)}
        </span>
      </div>

      <div className="theme-surface-subtle rounded-[24px] border p-4">
        <p className="text-sm leading-6 text-ios-text">
          {plant.seedSummary?.trim() || 'Сейчас важнее всего держать посев в стабильных условиях и делать только те шаги, которые помогают этой стадии.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="theme-surface-subtle rounded-[22px] border p-3">
          <p className="text-xs text-ios-subtext">Стадия</p>
          <p className="mt-1 text-sm font-semibold text-ios-text">{seedStageLabel(plant.seedStage)}</p>
        </div>
        <div className="theme-surface-subtle rounded-[22px] border p-3">
          <p className="text-xs text-ios-subtext">После посева</p>
          <p className="mt-1 text-sm font-semibold text-ios-text">{daysSinceSowing != null ? `${daysSinceSowing} дн.` : 'Дата не указана'}</p>
        </div>
        <div className="theme-surface-subtle rounded-[22px] border p-3">
          <p className="text-xs text-ios-subtext">Окно всходов</p>
          <p className="mt-1 text-sm font-semibold text-ios-text">{windowLabel}</p>
        </div>
      </div>

      <div className="theme-surface-subtle rounded-[24px] border p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-subtext">Что важно сейчас</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {conditions.map((item) => (
            <span key={item} className="inline-flex rounded-full bg-ios-card px-3 py-1.5 text-xs text-ios-text">
              {item}
            </span>
          ))}
        </div>
      </div>

      {reasoning.length ? (
        <div className="theme-surface-subtle rounded-[24px] border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Почему это имеет смысл</p>
          <ul className="mt-2 space-y-2 text-sm text-ios-text">
            {reasoning.map((item, idx) => (
              <li key={`${item}-${idx}`} className="leading-5">• {humanizeSeedSentence(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="theme-surface-warning rounded-[24px] border p-4">
          <p className="theme-text-warning text-xs font-semibold uppercase tracking-[0.14em]">Важные замечания</p>
          <ul className="mt-2 space-y-2 text-sm text-ios-text">
            {warnings.map((item, idx) => (
              <li key={`${item}-${idx}`} className="leading-5">• {humanizeSeedSentence(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SeedJournalBlock({
  notes,
  onAdd,
  onDelete
}: {
  notes: PlantNoteDto[];
  onAdd: () => void;
  onDelete: (noteId: string) => void;
}) {
  return (
    <section className="theme-surface-1 space-y-3 rounded-[30px] border p-4 shadow-sm backdrop-blur-ios">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Журнал ухода</p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ios-text">Наблюдения по seed-flow</h3>
          <p className="mt-1 text-sm leading-5 text-ios-subtext">Сюда удобно записывать первые всходы, снятие крышки, перенос под свет и любые ранние сигналы.</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ios-accent/10 px-3 py-1.5 text-xs font-medium text-ios-accent transition-colors active:bg-ios-accent/20"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Запись
        </button>
      </div>

      {notes.length ? (
        <NotesList notes={notes.slice(0, 5)} onDelete={onDelete} />
      ) : (
        <div className="theme-surface-subtle rounded-[24px] border px-4 py-4">
          <p className="text-sm font-medium text-ios-text">Пока журнал пуст</p>
          <p className="mt-1 text-sm leading-5 text-ios-subtext">Добавьте короткую запись, когда появятся первые ростки, подсохнет субстрат или вы измените условия.</p>
        </div>
      )}
    </section>
  );
}

function SeedTrackingBlock({
  actionEvents,
  historyEvents,
  historyLoading,
  historyError
}: {
  actionEvents: Array<{ id: string; label: string; dateLabel: string; sortTime: number }>;
  historyEvents: RecommendationHistoryItemDto[];
  historyLoading: boolean;
  historyError: boolean;
}) {
  const previewEvents = actionEvents.slice(0, 4);

  return (
    <section className="theme-surface-1 space-y-3 rounded-[30px] border p-4 shadow-sm backdrop-blur-ios">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Недавние события</p>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ios-text">Что уже изменилось</h3>
        <p className="mt-1 text-sm leading-5 text-ios-subtext">Короткая лента по реальным действиям и важным обновлениям режима.</p>
      </div>

      {previewEvents.length ? (
        <div className="space-y-2">
          {previewEvents.map((event) => (
            <div key={event.id} className="theme-surface-subtle flex items-center justify-between gap-3 rounded-[22px] border px-3.5 py-3">
              <span className="text-sm font-medium text-ios-text">{event.label}</span>
              <span className="shrink-0 text-xs text-ios-subtext">{event.dateLabel}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="theme-surface-subtle rounded-[24px] border px-4 py-4">
          <p className="text-sm font-medium text-ios-text">Пока без событий</p>
          <p className="mt-1 text-sm leading-5 text-ios-subtext">После первого действия здесь появятся спокойные human-readable записи вроде «29 марта · Перенесено под свет».</p>
        </div>
      )}

      <div className="theme-surface-subtle rounded-[24px] border p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ios-subtext">Изменения режима</p>
        {historyLoading ? (
          <p className="mt-2 text-sm text-ios-subtext">Загружаем изменения режима...</p>
        ) : historyError ? (
          <p className="mt-2 text-sm text-ios-subtext">История режима пока недоступна, но новые изменения появятся здесь автоматически.</p>
        ) : historyEvents.length ? (
          <div className="mt-2 space-y-2">
            {historyEvents.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-[18px] bg-white/70 px-3 py-2.5 dark:bg-ios-card/70">
                <p className="text-sm font-medium text-ios-text">{historyTitle(item)}</p>
                <p className="mt-1 text-xs leading-5 text-ios-subtext">{humanizeSeedSentence(historyReasonLine(item))}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ios-subtext">Когда режим скорректируется из-за стадии или после перевода в растение, это появится здесь.</p>
        )}
      </div>
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
  hasAiAdvice,
  advice,
  onRefresh
}: {
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  hasAiAdvice: boolean;
  advice: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-ios-border/40 bg-ios-surface-subtle/50 p-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Leaf className="h-4 w-4 shrink-0 text-emerald-500" />
        <p className="truncate text-xs text-ios-text">
          {loading ? 'Загрузка...' : error ? 'Ошибка' : hasAiAdvice && advice ? advice.slice(0, 60) + (advice.length > 60 ? '...' : '') : 'Нет AI советов'}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1.5 hover:bg-ios-border/30"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCcw className={`h-3.5 w-3.5 text-ios-subtext ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

function WateringRecommendationCard({
  plant,
  state,
  recommendation,
  loading,
  onRefresh
}: {
  plant: PlantDto;
  state: 'idle' | 'loading' | 'success' | 'fallback' | 'error';
  recommendation: WateringRecommendationPreviewDto | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const explainability = buildExplainabilityViewModel({ plant, recommendation });
  const canRenderExplainability = Boolean(
    recommendation
      || explainability.summary.trim()
      || explainability.topFactors.length
  );

  const isManualMode = recommendation?.source === 'MANUAL';
  const modeLabel = isManualMode ? 'Ручной' : 'Авто';
  const modeColor = isManualMode ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  const modeBg = isManualMode ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="theme-surface-1 space-y-2 rounded-2xl border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ios-text">Почему</p>
          {recommendation && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${modeBg} ${modeColor}`}>
              {modeLabel}
            </span>
          )}
        </div>
        <Button type="button" variant="ghost" className="h-8 rounded-lg px-2 text-xs" disabled={loading} onClick={onRefresh}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {state === 'idle' ? (
        <p className="text-xs text-ios-subtext">Нажмите обновить для рекомендации</p>
      ) : null}

      {state === 'loading' ? (
        <div className="space-y-2 py-2">
          <div className="h-3 w-1/2 animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-full animate-pulse rounded bg-ios-border/70" />
        </div>
      ) : null}

      {state === 'error' ? (
        <button type="button" className="text-xs text-red-500 underline" onClick={onRefresh}>
          Ошибка. Нажмите для повтора
        </button>
      ) : null}

      {canRenderExplainability && state !== 'loading' ? (
        <div className="space-y-2">
          <p className="line-clamp-2 text-sm text-ios-text">{explainability.summary}</p>
          
          {explainability.topFactors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {explainability.topFactors.slice(0, 2).map((item, idx) => (
                <span key={`${item}-${idx}`} className="rounded-full bg-ios-surface-subtle px-2 py-0.5 text-[10px] text-ios-subtext">
                  {item}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            className="text-[10px] text-ios-subtext underline"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Скрыть' : 'Подробнее'}
          </button>

          {expanded && (
            <div className="space-y-2 pt-2">
              {recommendation?.reasoning?.length ? (
                <ul className="space-y-1 text-xs text-ios-text">
                  {recommendation.reasoning.slice(0, 3).map((item, idx) => (
                    <li key={`${item}-${idx}`}>• {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </motion.section>
  );
}

function DangerZoneSection({ onDeleteClick }: { onDeleteClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl border border-red-200/40 bg-red-50/50 px-3 py-2.5 dark:border-red-800/30 dark:bg-red-950/20"
      onClick={onDeleteClick}
    >
      <span className="text-xs text-red-600 dark:text-red-400">Удалить растение</span>
      <Trash2 className="h-3.5 w-3.5 text-red-400" />
    </button>
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
  const latest = history?.latestVisibleChange ?? dedupedItems[0] ?? null;
  const isSeedPlant = plant.wateringProfile === 'SEED_START' || plant.category === 'SEED_START';
  const fallbackSummary = isSeedPlant ? null : (recommendation?.summary?.trim() || plant.recommendationSummary?.trim());
  const timelineQuery = useQuery({
    queryKey: ['plant-recommendation-history-full', plant.id, timelineOpen],
    queryFn: () => getRecommendationHistory(plant.id, { view: 'full', limit: 20 }),
    enabled: timelineOpen,
    staleTime: 60_000,
    retry: 1
  });
  const timelineItems = dedupeHistoryItems(timelineQuery.data?.items);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ios-text">История</p>
        {dedupedItems.length > 0 && (
          <button type="button" className="text-[10px] text-ios-subtext underline" onClick={() => setTimelineOpen(true)}>
            Все {dedupedItems.length}
          </button>
        )}
      </div>
      
      {loading ? (
        <p className="text-xs text-ios-subtext">Загрузка...</p>
      ) : error ? (
        <div className="rounded-xl border border-ios-border/50 bg-ios-surface-subtle/50 px-3 py-2.5">
          <p className="text-xs leading-5 text-ios-subtext">История режима пока недоступна. Когда появятся новые изменения, они отобразятся здесь.</p>
        </div>
      ) : latest ? (
        <div className="flex items-center gap-2 rounded-lg bg-ios-surface-subtle/50 px-2.5 py-2">
          <span className="text-xs text-ios-text">{historyTitle(latest)}</span>
          {historyDeltaLabel(latest) && (
            <span className="rounded bg-ios-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-ios-accent">
              {historyDeltaLabel(latest)}
            </span>
          )}
        </div>
      ) : fallbackSummary ? (
        <p className="text-xs text-ios-subtext">{fallbackSummary.slice(0, 50)}{fallbackSummary.length > 50 ? '...' : ''}</p>
      ) : (
        <p className="text-xs text-ios-subtext">Пока нет истории</p>
      )}

      <Dialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        title="История режима"
      >
        {timelineQuery.isLoading ? <p className="text-sm text-ios-subtext">Загрузка...</p> : null}
        {timelineQuery.isError ? <p className="text-sm text-red-500">Ошибка</p> : null}
        {!timelineQuery.isLoading && !timelineQuery.isError && timelineItems.length > 0 && (
          <div className="space-y-2">
            {timelineItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-ios-border/40 p-2.5">
                <p className="text-xs font-medium text-ios-text">{historyTitle(item)}</p>
                <p className="mt-1 text-[10px] text-ios-subtext">{historyReasonLine(item)}</p>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
