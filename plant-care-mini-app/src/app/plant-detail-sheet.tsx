import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Droplets, Leaf, LocateFixed, Trash2, Waves } from 'lucide-react';
import { motion } from 'framer-motion';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { ConditionsWidget } from '@/components/ConditionsWidget';
import { ConditionsChart } from '@/components/ConditionsChart';
import { RoomAndSensorSelector } from '@/components/RoomAndSensorSelector';
import { SmartReminderCard } from '@/components/SmartReminderCard';
import { GrowthGallery } from '@/app/PlantDetail/GrowthGallery';
import { DiagnosisTool } from '@/app/PlantDetail/DiagnosisTool';
import { ProgressRing } from '@/components/common/progress-ring';
import { Button } from '@/components/ui/button';
import { deletePlant, getPlantById, uploadPlantPhoto, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useUiStore } from '@/lib/store';
import type { PlantDto } from '@/types/api';

function getProgress(plant: PlantDto): number {
  const base = Math.max(1, plant.baseIntervalDays ?? 7);
  const last = new Date(plant.lastWateredDate);
  const now = new Date();
  const diff = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
  return Math.max(0, Math.min(100, (diff / base) * 100));
}

function nextWateringText(plant: PlantDto): string {
  if (!plant.nextWateringDate) {
    return 'Дата следующего полива рассчитывается...';
  }
  const date = new Date(plant.nextWateringDate);
  return `Следующий полив: ${date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}`;
}

export function PlantDetailSheet() {
  const queryClient = useQueryClient();
  const selectedPlantId = useUiStore((s) => s.selectedPlantId);
  const closePlantDetail = useUiStore((s) => s.closePlantDetail);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const plantQuery = useQuery({
    queryKey: ['plant', selectedPlantId],
    queryFn: () => getPlantById(selectedPlantId as number),
    enabled: selectedPlantId !== null
  });

  const waterMutation = useMutation({
    mutationFn: (id: number) => waterPlant(id),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
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
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePlant(id),
    onSuccess: () => {
      hapticNotify('success');
      closePlantDetail();
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => hapticNotify('error')
  });

  const plant = useMemo(() => plantQuery.data ?? null, [plantQuery.data]);

  return (
    <BottomSheet open={selectedPlantId !== null} onClose={closePlantDetail}>
      {plantQuery.isLoading ? (
        <div className="py-6 text-center text-ios-subtext">Загружаем детали...</div>
      ) : null}

      {plant ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-ios-large-title">{plant.name}</h2>
            <p className="text-ios-caption text-ios-subtext">
              {plant.placement === 'OUTDOOR' ? 'Уличное растение' : 'Комнатное растение'}
            </p>
          </div>

          <div className="ios-blur-card space-y-3 p-4">
            <p className="text-ios-caption text-ios-subtext">Фото растения</p>
            <div className="overflow-hidden rounded-ios-card border border-ios-border/60 bg-ios-card/60">
              {previewDataUrl || plant.photoUrl ? (
                <img
                  src={previewDataUrl ?? plant.photoUrl}
                  alt={plant.name}
                  className="h-44 w-full object-cover"
                />
              ) : (
                <div className="flex h-44 items-center justify-center text-ios-subtext">Фото пока нет</div>
              )}
            </div>
            <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-ios-button border border-ios-border/70 bg-white/60 px-4 py-2 text-ios-body dark:bg-zinc-900/50">
              <Camera className="mr-2 h-4 w-4" />
              {photoMutation.isPending ? 'Загрузка...' : 'Загрузить фото'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file || !selectedPlantId) {
                    return;
                  }
                  hapticImpact('light');
                  const dataUrl = await toDataUrl(file);
                  setPreviewDataUrl(dataUrl);
                  photoMutation.mutate({ id: selectedPlantId, dataUrl });
                }}
              />
            </label>
          </div>

          <GrowthGallery plantId={plant.id} photoUrl={plant.photoUrl} />

          <div className="ios-blur-card flex items-center justify-between p-4">
            <div>
              <p className="text-ios-caption text-ios-subtext">Состояние цикла</p>
              <p className="mt-1 text-ios-title-2">{Math.round(getProgress(plant))}%</p>
              <p className="mt-1 text-ios-caption text-ios-subtext">{nextWateringText(plant)}</p>
            </div>
            <ProgressRing value={getProgress(plant)} label="влага" />
          </div>

          <SmartReminderCard plant={plant} />

          <div className="grid grid-cols-3 gap-2">
            <InfoPill icon={Droplets} label="Объём" value={`${plant.recommendedWaterMl ?? 0} мл`} />
            <InfoPill icon={Waves} label="Интервал" value={`${plant.baseIntervalDays ?? 7} дн.`} />
            <InfoPill icon={LocateFixed} label="Тип" value={plant.placement === 'OUTDOOR' ? 'Улица' : 'Дом'} />
          </div>

          <ConditionsWidget plantId={plant.id} />
          <ConditionsChart plantId={plant.id} />
          <RoomAndSensorSelector plantId={plant.id} compact />
          <DiagnosisTool plantName={plant.name} />

          <motion.div
            animate={waterMutation.isPending ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26, mass: 1 }}
          >
            <Button
              className="h-14 w-full text-ios-body"
              onClick={() => {
                if (!selectedPlantId) {
                  return;
                }
                hapticImpact('rigid');
                waterMutation.mutate(selectedPlantId);
              }}
              disabled={waterMutation.isPending}
            >
              <Leaf className="mr-2 h-5 w-5" />
              {waterMutation.isPending ? 'Отмечаем полив...' : 'Отметить как полито'}
            </Button>
          </motion.div>

          <Button
            variant="secondary"
            className="h-12 w-full border-red-300/70 bg-red-50/60 text-red-600 hover:bg-red-100/70 dark:bg-red-950/30"
            onClick={() => {
              if (!selectedPlantId) {
                return;
              }
              hapticImpact('heavy');
              deleteMutation.mutate(selectedPlantId);
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {deleteMutation.isPending ? 'Удаляем...' : 'Удалить растение'}
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
}) {
  return (
    <div className="ios-blur-card p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-ios-accent" />
      <p className="mt-1 text-[11px] text-ios-subtext">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-ios-text">{value}</p>
    </div>
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
