import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Droplets, Leaf, Loader2, RefreshCcw, Trash2 } from 'lucide-react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { Dialog } from '@/components/ui/dialog';
import { PlantDetailPage } from '@/app/PlantDetail/PlantDetailPage';
import { GrowthCarousel } from '@/components/GrowthCarousel';
import { LeafDiagnosis } from '@/components/LeafDiagnosis';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import { Button } from '@/components/ui/button';
import { apiFetch, deletePlant, getPlantById, getPlantCareAdvice, uploadPlantPhoto, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useUiStore } from '@/lib/store';
import type { PlantCareAdviceDto, PlantDto, WateringRecommendationPreviewDto } from '@/types/api';

function getProgress(plant: PlantDto): number {
  const last = new Date(plant.lastWateredDate);
  const next = plant.nextWateringDate
    ? new Date(plant.nextWateringDate)
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
    ? new Date(plant.nextWateringDate)
    : new Date(new Date(plant.lastWateredDate).getTime() + Math.max(1, plant.baseIntervalDays ?? 7) * 86_400_000);
  const target = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return target.getTime() < today.getTime();
}

function getNextDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return new Date(plant.nextWateringDate);
  }
  const last = new Date(plant.lastWateredDate);
  const next = new Date(last);
  next.setDate(next.getDate() + Math.max(1, plant.baseIntervalDays ?? 7));
  return next;
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

function recommendationBadge(source?: string | null): string {
  const normalized = (source ?? '').toUpperCase();
  if (!normalized) return 'N/A';
  if (normalized.includes('WEATHER')) return 'Weather adjusted';
  if (normalized.includes('HYBRID')) return 'Hybrid';
  if (normalized.includes('FALLBACK') || normalized.includes('HEURISTIC') || normalized.includes('BASE')) return 'Fallback';
  if (normalized.includes('MANUAL')) return 'Manual';
  if (normalized.includes('AI') || normalized.includes('OPENROUTER')) return 'AI';
  return source ?? 'N/A';
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

export function PlantDetailSheet() {
  const queryClient = useQueryClient();
  const selectedPlantId = useUiStore((s) => s.selectedPlantId);
  const closePlantDetail = useUiStore((s) => s.closePlantDetail);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteShake, setDeleteShake] = useState(false);
  const [wateringPulse, setWateringPulse] = useState(0);

  const plantQuery = useQuery({
    queryKey: ['plant', selectedPlantId],
    queryFn: () => getPlantById(selectedPlantId as number),
    enabled: selectedPlantId !== null
  });

  const careAdviceQuery = useQuery({
    queryKey: ['plant-care-advice', selectedPlantId],
    queryFn: () => getPlantCareAdvice(selectedPlantId as number),
    enabled: selectedPlantId !== null,
    staleTime: 60_000,
    retry: 1
  });

  const recommendationQuery = useQuery({
    queryKey: ['plant-watering-recommendation', selectedPlantId],
    queryFn: () => apiFetch<WateringRecommendationPreviewDto>(`/api/watering/recommendation/${selectedPlantId}/refresh`, {
      method: 'POST'
    }),
    enabled: selectedPlantId !== null,
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
          summary: 'Manual override from plant detail card.'
        })
      }),
    onSuccess: async () => {
      hapticNotify('success');
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      await queryClient.invalidateQueries({ queryKey: ['plant-watering-recommendation', selectedPlantId] });
    },
    onError: () => hapticNotify('error')
  });

  const refreshAdviceMutation = useMutation({
    mutationFn: (id: number) => getPlantCareAdvice(id, true),
    onSuccess: (data, id) => {
      queryClient.setQueryData(['plant-care-advice', id], data);
      hapticNotify('success');
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  const waterMutation = useMutation({
    mutationFn: (id: number) => waterPlant(id),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['plant-care-advice', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant-watering-recommendation', selectedPlantId] });
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  const photoMutation = useMutation({
    mutationFn: ({ id, dataUrl }: { id: number; dataUrl: string }) => uploadPlantPhoto(id, dataUrl),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant-care-advice', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePlant(id),
    onSuccess: () => {
      hapticNotify('success');
      setDeleteConfirmOpen(false);
      closePlantDetail();
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => hapticNotify('error')
  });

  const plant = useMemo(() => plantQuery.data ?? null, [plantQuery.data]);
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
            onPickPhoto={async (file) => {
              if (!selectedPlantId) {
                return;
              }
              hapticImpact('medium');
              navigator.vibrate?.(100);
              const dataUrl = await toDataUrl(file);
              setPreviewDataUrl(dataUrl);
              photoMutation.mutate({ id: selectedPlantId, dataUrl });
            }}
          >
            <WaterStatusBlock
              plant={plant}
              progress={getProgress(plant)}
              isOverdue={isOverdue}
              isLoading={waterMutation.isPending}
              nextWateringDate={getNextDate(plant)}
              onWater={async () => {
                if (!selectedPlantId) return;
                await waterMutation.mutateAsync(selectedPlantId);
                triggerWateringPulse();
              }}
            />

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
                refreshAdviceMutation.mutate(selectedPlantId);
              }}
            />

            <WateringRecommendationCard
              plant={plant}
              state={recommendationState}
              recommendation={recommendationQuery.data ?? null}
              loading={recommendationQuery.isFetching}
              onRefresh={() => {
                if (!selectedPlantId || recommendationQuery.isFetching) {
                  return;
                }
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

            <LeafDiagnosis plant={plant} />

            <DangerZoneSection
              onDeleteClick={() => {
                hapticImpact('rigid');
                setDeleteConfirmOpen(true);
              }}
            />
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
              <div className="mb-4 rounded-2xl border border-red-300/60 bg-red-50/60 p-3 text-xs text-red-700 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-300">
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
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!selectedPlantId) {
                      return;
                    }
                    hapticImpact('heavy');
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
  onWater
}: {
  plant: PlantDto;
  progress: number;
  nextWateringDate: Date;
  isOverdue: boolean;
  isLoading: boolean;
  onWater: () => Promise<void> | void;
}) {
  const moistureLeft = Math.max(0, Math.min(100, 100 - Math.round(progress)));
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.ceil((nextWateringDate.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  );
  const nextLabel = isOverdue
    ? 'Полив просрочен'
    : daysLeft === 0
      ? 'Полив сегодня'
      : `Через ${daysLeft} дн.`;

  return (
    <section className="space-y-4 rounded-3xl border border-ios-border/60 bg-white/80 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/75">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ios-subtext">Сегодня</p>
          <p className="mt-1 text-lg font-semibold text-ios-text">
            {isOverdue ? 'Растению нужен полив' : 'Состояние стабильное'}
          </p>
          <p className="text-sm text-ios-subtext">
            Следующий полив: {nextWateringDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}
          </p>
        </div>
        <span
          className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold ${
            isOverdue
              ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          }`}
        >
          {isOverdue ? 'Срочно' : 'В порядке'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-ios-border/55 bg-white/75 p-3 dark:bg-zinc-900/55">
          <p className="text-xs text-ios-subtext">Влага</p>
          <p className="mt-1 text-xl font-semibold text-ios-text">{moistureLeft}%</p>
        </div>
        <div className="rounded-2xl border border-ios-border/55 bg-white/75 p-3 dark:bg-zinc-900/55">
          <p className="text-xs text-ios-subtext">Полив</p>
          <p className="mt-1 text-xl font-semibold text-ios-text">{nextLabel}</p>
        </div>
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

      <QuickWaterButton isLoading={isLoading} isOverdue={isOverdue} onWater={onWater} onSuccess={() => undefined} />

      <p className="text-xs text-ios-subtext">
        Цикл полива: {Math.max(1, plant.baseIntervalDays ?? 7)} дн.
      </p>
    </section>
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
    <section className="space-y-3 rounded-3xl border border-ios-border/60 bg-white/80 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/75">
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
        <Button type="button" variant="ghost" className="h-11 rounded-xl px-3 text-xs" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1 h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-2xl border border-ios-border/50 bg-white/70 p-3 dark:bg-zinc-900/55">
          <div className="h-3 w-1/3 animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-full animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-ios-border/70" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-50/70 p-3 text-sm dark:border-red-700/50 dark:bg-red-950/30">
          <p className="font-medium text-red-700 dark:text-red-300">Не удалось загрузить AI советы.</p>
          <p className="mt-1 text-xs text-red-600/90 dark:text-red-200/90">Проверьте сеть и повторите запрос.</p>
          <Button type="button" variant="secondary" className="mt-3 h-10 rounded-xl" onClick={onRefresh}>
            Повторить
          </Button>
        </div>
      ) : null}

      {!loading && !error && hasAiAdvice && advice ? (
        <div className="rounded-2xl border border-emerald-300/50 bg-emerald-50/75 p-3 dark:border-emerald-700/40 dark:bg-emerald-950/25">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Bot className="h-4 w-4" />
            Источник: {source ?? 'OpenRouter'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ios-text">{advice}</p>
        </div>
      ) : null}

      {!loading && !error && !hasAiAdvice ? (
        <div className="rounded-2xl border border-amber-300/55 bg-amber-50/70 p-3 dark:border-amber-700/45 dark:bg-amber-950/25">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            AI временно недоступен, показан базовый совет.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ios-text">
            {advice ?? 'Пока нет дополнительных рекомендаций. Попробуйте обновить позже.'}
          </p>
        </div>
      ) : null}

      {refreshError && !loading ? (
        <p className="inline-flex items-center gap-1 text-xs text-red-500">
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
  const isOutdoor = plant.placement === 'OUTDOOR';
  const badge = recommendationBadge(recommendation?.source ?? null);

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
      className="space-y-3 rounded-3xl border border-ios-border/60 bg-white/80 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/75"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ios-text">Рекомендация полива</p>
          <p className="text-xs text-ios-subtext">Smart watering engine</p>
        </div>
        <div className="inline-flex items-center gap-2">
          <span className="rounded-full border border-ios-border/60 px-2 py-1 text-[11px] text-ios-subtext">{badge}</span>
          <Button type="button" variant="ghost" className="h-11 rounded-xl px-3 text-xs" disabled={loading} onClick={onRefresh}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1 h-4 w-4" />}
            Обновить
          </Button>
        </div>
      </div>

      {state === 'idle' ? (
        <div className="rounded-2xl border border-ios-border/50 bg-white/70 p-3 text-sm text-ios-subtext dark:bg-zinc-900/55">
          Нажмите «Обновить», чтобы получить актуальную рекомендацию.
        </div>
      ) : null}

      {state === 'loading' ? (
        <div className="space-y-2 rounded-2xl border border-ios-border/50 bg-white/70 p-3 dark:bg-zinc-900/55">
          <div className="h-3 w-1/3 animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-full animate-pulse rounded bg-ios-border/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-ios-border/70" />
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="rounded-2xl border border-red-300/60 bg-red-50/70 p-3 text-sm dark:border-red-700/50 dark:bg-red-950/30">
          <p className="font-medium text-red-700 dark:text-red-300">Не удалось получить рекомендацию.</p>
          <p className="mt-1 text-xs text-red-600/90 dark:text-red-200/90">Проверьте сеть и повторите запрос.</p>
          <Button type="button" variant="secondary" className="mt-3 h-10 rounded-xl" onClick={onRefresh}>
            Повторить
          </Button>
        </div>
      ) : null}

      {(state === 'success' || state === 'fallback') && recommendation ? (
        <div className={`rounded-2xl border p-3 ${
          state === 'fallback'
            ? 'border-amber-300/60 bg-amber-50/70 dark:border-amber-700/45 dark:bg-amber-950/25'
            : 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-700/45 dark:bg-emerald-950/25'
        }`}>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-current/15 bg-white/60 p-2 dark:bg-black/10">
              Интервал: <b>{recommendation.recommendedIntervalDays} дн.</b>
            </div>
            <div className="rounded-xl border border-current/15 bg-white/60 p-2 dark:bg-black/10">
              Объём: <b>{recommendation.recommendedWaterMl} мл</b>
            </div>
            <div className="rounded-xl border border-current/15 bg-white/60 p-2 dark:bg-black/10">
              Режим: <b>{recommendation.wateringMode ?? 'STANDARD'}</b>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border border-current/20 bg-white/55 px-2 py-0.5 dark:bg-black/10">
              Уверенность: {recommendation.confidence != null ? `${Math.round(recommendation.confidence * 100)}%` : 'N/A'}
            </span>
            <span className="rounded-full border border-current/20 bg-white/55 px-2 py-0.5 dark:bg-black/10">
              Источники: {isOutdoor ? 'weather + model' : 'base profile + model'}
            </span>
          </div>
          <p className="mt-2 text-sm text-ios-text">{recommendation.summary}</p>

          {isOutdoor ? (
            <div className="mt-2 rounded-xl border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
              Погодное влияние:{' '}
              {recommendation.weatherContextPreview?.available
                ? `${recommendation.weatherContextPreview.city || plant.region || 'регион'} · ` +
                  `${recommendation.weatherContextPreview.temperatureNowC ?? '—'}°C · ` +
                  `осадки ${recommendation.weatherContextPreview.precipitationForecastMm ?? '—'} мм`
                : 'нет данных, fallback-коррекция'}
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
              Indoor-база: горшок {plant.potVolumeLiters?.toFixed(1) ?? '—'} л · тип {plant.type ?? 'DEFAULT'} · размещение {plant.placement} · базовый интервал {Math.max(1, plant.baseIntervalDays ?? 7)} дн.
            </div>
          )}
          <div className="mt-2 rounded-xl border border-current/15 bg-white/60 p-2 text-xs dark:bg-black/10">
            Почему такой режим: {isOutdoor
              ? 'учтены температура, осадки, влажность и сезон.'
              : 'учтены тип растения, объём горшка, размещение и сезон.'}
          </div>

          {recommendation.reasoning?.length ? (
            <ul className="mt-2 space-y-1 text-xs text-ios-subtext">
              {recommendation.reasoning.map((item, idx) => (
                <li key={`${item}-${idx}`}>• {item}</li>
              ))}
            </ul>
          ) : null}
          {recommendation.warnings?.length ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
              {recommendation.warnings.map((item, idx) => (
                <li key={`${item}-${idx}`}>• {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-ios-border/50 bg-white/70 p-3 dark:bg-zinc-900/55">
        <p className="text-xs font-medium text-ios-text">Manual override</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            min={1}
            max={60}
            value={manualInterval}
            onChange={(e) => setManualInterval(e.target.value)}
            className="h-10 rounded-xl border border-ios-border/70 bg-white/80 px-3 text-sm dark:bg-zinc-900/60"
            placeholder="Интервал"
          />
          <input
            type="number"
            min={50}
            max={10000}
            step={50}
            value={manualWaterMl}
            onChange={(e) => setManualWaterMl(e.target.value)}
            className="h-10 rounded-xl border border-ios-border/70 bg-white/80 px-3 text-sm dark:bg-zinc-900/60"
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
    <section className="rounded-3xl border border-red-300/50 bg-red-50/60 p-4 dark:border-red-700/40 dark:bg-red-950/25">
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">Опасная зона</p>
      <p className="mt-1 text-xs text-red-600/90 dark:text-red-200/90">
        Удаление стирает растение, фото роста и связанную историю.
      </p>
      <Button
        type="button"
        variant="ghost"
        className="mt-3 h-11 w-full rounded-2xl border border-red-300/70 bg-red-50/70 px-3 text-red-600 hover:bg-red-100/70 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-300"
        onClick={onDeleteClick}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Удалить растение
      </Button>
    </section>
  );
}
