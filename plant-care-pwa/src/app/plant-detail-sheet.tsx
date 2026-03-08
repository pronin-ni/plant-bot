import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { Dialog } from '@/components/ui/dialog';
import { ConditionsWidget } from '@/components/ConditionsWidget';
import { ConditionsChart } from '@/components/ConditionsChart';
import { RoomAndSensorSelector } from '@/components/RoomAndSensorSelector';
import { AIRecommendationCard } from '@/components/AIRecommendationCard';
import { PlantDetailPage } from '@/app/PlantDetail/PlantDetailPage';
import { GrowthCarousel } from '@/components/GrowthCarousel';
import { LeafDiagnosis } from '@/components/LeafDiagnosis';
import { CycleProgress } from '@/components/CycleProgress';
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

export function PlantDetailSheet() {
  const queryClient = useQueryClient();
  const selectedPlantId = useUiStore((s) => s.selectedPlantId);
  const closePlantDetail = useUiStore((s) => s.closePlantDetail);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteShake, setDeleteShake] = useState(false);

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
    }
  }, [selectedPlantId]);

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
            onRequestDelete={() => {
              hapticImpact('rigid');
              setDeleteConfirmOpen(true);
            }}
            onPickPhoto={async (file) => {
              if (!selectedPlantId) {
                return;
              }
              hapticImpact('light');
              const dataUrl = await toDataUrl(file);
              setPreviewDataUrl(dataUrl);
              photoMutation.mutate({ id: selectedPlantId, dataUrl });
            }}
          >
            <GrowthCarousel plantId={plant.id} currentPhotoUrl={plant.photoUrl} />

            <CycleProgress
              plant={plant}
              progress={getProgress(plant)}
              isWatering={waterMutation.isPending}
              onWater={async () => {
                if (!selectedPlantId) {
                  return;
                }
                await waterMutation.mutateAsync(selectedPlantId);
              }}
            />

            <AIRecommendationCard
              plant={plant}
              advice={careAdviceQuery.data}
              loading={careAdviceQuery.isLoading || careAdviceQuery.isFetching}
              onRefresh={() => {
                void careAdviceQuery.refetch();
              }}
            />

            <ConditionsWidget plantId={plant.id} />
            <ConditionsChart plantId={plant.id} />
            <RoomAndSensorSelector plantId={plant.id} compact />
            <LeafDiagnosis plant={plant} />

            <motion.div
              className="detail-bottom-safe sticky bottom-0 z-20 mt-2 rounded-3xl border border-ios-border/60 bg-ios-card/70 p-2.5 shadow-[0_-8px_28px_rgba(0,0,0,0.14)] backdrop-blur-[22px] android:rounded-[22px] android:bg-[#FFFBFE] android:border-[#E7E0EC] android:backdrop-blur-0 android:shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30, delay: 0.12 }}
            >
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <QuickWaterButton
                  isLoading={waterMutation.isPending}
                  isOverdue={isOverdue}
                  onWater={async () => {
                    if (!selectedPlantId) {
                      return;
                    }
                    await waterMutation.mutateAsync(selectedPlantId);
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-2xl border border-red-300/70 bg-red-50/70 px-3 text-red-600 hover:bg-red-100/70 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-300"
                  onClick={() => {
                    hapticImpact('rigid');
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
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
