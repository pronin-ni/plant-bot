import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, Droplets, Leaf, Loader2, RefreshCcw, Trash2 } from 'lucide-react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { Dialog } from '@/components/ui/dialog';
import { PlantDetailPage } from '@/app/PlantDetail/PlantDetailPage';
import { GrowthCarousel } from '@/components/GrowthCarousel';
import { LeafDiagnosis } from '@/components/LeafDiagnosis';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import { Button } from '@/components/ui/button';
import { deletePlant, getPlantById, getPlantCareAdvice, uploadPlantPhoto, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useUiStore } from '@/lib/store';
import type { PlantDto } from '@/types/api';

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
    enabled: selectedPlantId !== null
  });

  const waterMutation = useMutation({
    mutationFn: (id: number) => waterPlant(id),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['plant-care-advice', selectedPlantId] });
      void queryClient.invalidateQueries({ queryKey: ['plant', selectedPlantId] });
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
        <div className="py-6 text-center text-ios-subtext">Загружаем детали...</div>
      ) : null}

      {plant ? (
        <>
          <PlantDetailPage
            plant={plant}
            previewDataUrl={previewDataUrl}
            photoUploading={photoMutation.isPending}
            wateringPulse={wateringPulse}
            onRequestDelete={() => {
              hapticImpact('rigid');
              setDeleteConfirmOpen(true);
            }}
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
            <WaterCard
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

            <GrowthCard
              plant={plant}
              onAddPhoto={async (file) => {
                if (!selectedPlantId) return;
                hapticImpact('medium');
                navigator.vibrate?.(80);
                const dataUrl = await toDataUrl(file);
                setPreviewDataUrl(dataUrl);
                photoMutation.mutate({ id: selectedPlantId, dataUrl });
              }}
            />

            <AIShortAdvice
              loading={careAdviceQuery.isLoading || careAdviceQuery.isFetching}
              advice={
                careAdviceQuery.data?.note ??
                (careAdviceQuery.data?.soilComposition?.length ? careAdviceQuery.data.soilComposition.join(', ') : null)
              }
              onRefresh={() => void careAdviceQuery.refetch()}
            />

            <LeafDiagnosis plant={plant} />

            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-2xl border border-red-300/70 bg-red-50/70 px-3 text-red-600 hover:bg-red-100/70 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-300"
                onClick={() => {
                  hapticImpact('rigid');
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span className="ml-1 text-sm">Удалить</span>
              </Button>
            </div>
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

function WaterCard({
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
  const nextLabel =
    nextWateringDate.toDateString() === new Date().toDateString()
      ? 'Полив сегодня'
      : `Полив ${nextWateringDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}`;

  return (
    <section className="rounded-2xl border border-ios-border/60 bg-white/75 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/70">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-ios-subtext">Сегодня</p>
          <p className="mt-1 text-2xl font-semibold text-ios-text">{plant.name}</p>
          <p className="text-sm text-ios-subtext">{plant.category === 'HOME' ? 'Домашнее' : 'Уличное/садовое'}</p>
        </div>
        <div className="rounded-full bg-emerald-100/70 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
          {moistureLeft}% влаги
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-ios-subtext">
        <div className="rounded-xl border border-ios-border/50 bg-white/70 px-3 py-2 dark:bg-zinc-900/60">
          <p className="text-[12px] uppercase tracking-wide">Статус</p>
          <p className={`mt-1 text-base font-semibold ${isOverdue ? 'text-red-500' : 'text-ios-text'}`}>
            {isOverdue ? 'Нужно полить' : nextLabel}
          </p>
        </div>
        <div className="rounded-xl border border-ios-border/50 bg-white/70 px-3 py-2 dark:bg-zinc-900/60">
          <p className="text-[12px] uppercase tracking-wide">Прогресс цикла</p>
          <p className="mt-1 text-base font-semibold text-ios-text">{Math.round(progress)}%</p>
        </div>
      </div>

      <div className="mt-4">
        <QuickWaterButton
          isLoading={isLoading}
          isOverdue={isOverdue}
          onWater={onWater}
          onSuccess={() => undefined}
        />
      </div>
    </section>
  );
}

function GrowthCard({ plant, onAddPhoto }: { plant: PlantDto; onAddPhoto: (file: File) => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="space-y-3 rounded-2xl border border-ios-border/60 bg-white/75 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/70">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ios-text">Камера роста</p>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 rounded-xl"
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" />
          Добавить фото
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onAddPhoto(file);
            }
          }}
        />
      </div>
      <GrowthCarousel plantId={plant.id} currentPhotoUrl={plant.photoUrl} />
    </section>
  );
}

function AIShortAdvice({
  loading,
  advice,
  onRefresh
}: {
  loading: boolean;
  advice: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-2xl border border-ios-border/60 bg-white/75 p-4 shadow-sm backdrop-blur-ios dark:bg-zinc-950/70">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-ios-accent" />
          <p className="text-sm font-semibold text-ios-text">AI советы</p>
        </div>
        <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className="mr-1 h-4 w-4" />
          Обновить
        </Button>
      </div>
      <div className="flex items-start gap-2 text-sm text-ios-text">
        <Droplets className="mt-0.5 h-4 w-4 text-ios-subtext" />
        {loading ? (
          <span className="inline-flex items-center gap-1 text-ios-subtext">
            <Loader2 className="h-4 w-4 animate-spin" /> Получаем совет...
          </span>
        ) : advice ? (
          <p>{advice}</p>
        ) : (
          <p className="text-ios-subtext">Совет недоступен — попробуйте обновить.</p>
        )}
      </div>
    </section>
  );
}
