import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Sprout } from 'lucide-react';
import { motion } from 'framer-motion';

import { PlantCard } from '@/components/common/plant-card';
import { Button } from '@/components/ui/button';
import { getPlants, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import type { PlantDto } from '@/types/api';

type SortMode = 'created_desc' | 'alpha' | 'next_watering';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateRu(value: Date): string {
  return value.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short'
  });
}

function getIntervalDays(plant: PlantDto): number {
  return Math.max(1, plant.baseIntervalDays ?? 7);
}

function getLastWateredDate(plant: PlantDto): Date {
  return plant.lastWateredDate ? startOfDay(new Date(plant.lastWateredDate)) : startOfDay(new Date());
}

function getNextWateringDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return startOfDay(new Date(plant.nextWateringDate));
  }
  const last = getLastWateredDate(plant);
  const next = new Date(last);
  next.setDate(next.getDate() + getIntervalDays(plant));
  return startOfDay(next);
}

function getProgress(plant: PlantDto): number {
  const last = getLastWateredDate(plant);
  const now = startOfDay(new Date());
  const diffDays = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
  const raw = (diffDays / getIntervalDays(plant)) * 100;
  return Math.max(0, Math.min(100, raw));
}

function getNextWateringText(plant: PlantDto): string {
  const now = startOfDay(new Date());
  const next = getNextWateringDate(plant);
  const daysLeft = Math.floor((next.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 0) {
    return 'Пора поливать сегодня';
  }
  if (daysLeft === 1) {
    return 'Полив завтра';
  }
  return `Полив через ${daysLeft} дн. (${formatDateRu(next)})`;
}

function sortPlants(plants: PlantDto[], mode: SortMode): PlantDto[] {
  const copy = [...plants];
  if (mode === 'alpha') {
    copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return copy;
  }
  if (mode === 'next_watering') {
    copy.sort((a, b) => getNextWateringDate(a).getTime() - getNextWateringDate(b).getTime());
    return copy;
  }
  copy.sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (bt !== at) {
      return bt - at;
    }
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return copy;
}

export function HomeScreen() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const telegramUserId = useAuthStore((s) => s.telegramUserId);

  const sortStorageKey = useMemo(
    () => `plantbot.home.sort.${telegramUserId ?? 'anonymous'}`,
    [telegramUserId]
  );

  const [sortMode, setSortMode] = useState<SortMode>('created_desc');

  useEffect(() => {
    const saved = localStorage.getItem(sortStorageKey) as SortMode | null;
    if (saved === 'created_desc' || saved === 'alpha' || saved === 'next_watering') {
      setSortMode(saved);
      return;
    }
    setSortMode('created_desc');
  }, [sortStorageKey]);

  const plantsQuery = useQuery({
    queryKey: ['plants'],
    queryFn: getPlants
  });

  const waterMutation = useMutation({
    mutationFn: (plantId: number) => waterPlant(plantId),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  const plants = useMemo(() => sortPlants(plantsQuery.data ?? [], sortMode), [plantsQuery.data, sortMode]);

  if (plantsQuery.isLoading) {
    return (
      <div className="py-8 text-center text-ios-body text-ios-subtext">
        Загружаем растения...
      </div>
    );
  }

  if (plantsQuery.isError) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-ios-body text-red-500">Не удалось загрузить список растений.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            hapticImpact('light');
            void plantsQuery.refetch();
          }}
        >
          Попробовать снова
        </Button>
      </div>
    );
  }

  if (!plants.length) {
    return (
      <motion.div
        className="ios-blur-card flex min-h-[240px] flex-col items-center justify-center p-6 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 27, mass: 1 }}
      >
        <Sprout className="mb-3 h-9 w-9 text-ios-accent" />
        <h3 className="text-ios-title-2">Растений пока нет</h3>
        <p className="mt-1 text-ios-body text-ios-subtext">Нажми вкладку «Добавить», чтобы создать первое растение.</p>
      </motion.div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-ios-caption text-ios-subtext">Всего растений: {plants.length}</p>
        <div className="flex items-center gap-2">
          <select
            value={sortMode}
            onChange={(event) => {
              const next = event.target.value as SortMode;
              setSortMode(next);
              localStorage.setItem(sortStorageKey, next);
              hapticImpact('light');
            }}
            className="h-9 rounded-ios-button border border-ios-border/70 bg-white/70 px-2 text-[12px] outline-none backdrop-blur-ios dark:bg-zinc-900/60"
          >
            <option value="created_desc">Сначала новые</option>
            <option value="alpha">По алфавиту</option>
            <option value="next_watering">Скоро поливать</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-ios-subtext"
            onClick={() => {
              hapticImpact('light');
              void plantsQuery.refetch();
            }}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {plants.map((plant) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            progress={getProgress(plant)}
            nextWateringText={getNextWateringText(plant)}
            isWatering={waterMutation.isPending && waterMutation.variables === plant.id}
            onWater={() => waterMutation.mutate(plant.id)}
            onOpen={() => {
              hapticImpact('light');
              openPlantDetail(plant.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}
