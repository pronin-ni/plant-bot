import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Home, Sprout, TreePine } from 'lucide-react';

import { PlantAvatar } from '@/components/PlantAvatar';
import { getPlantStatusTone } from '@/components/plants/plantRecommendationUi';
import { Button } from '@/components/ui/button';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';
import { impactLight } from '@/lib/haptics';
import type { PlantDto } from '@/types/api';

interface PlantHeroProps {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  celebratePulse?: number;
}

function categoryMeta(plant: PlantDto): { label: string; icon: typeof Home } {
  if (plant.category === 'SEED_START' || plant.wateringProfile === 'SEED_START') {
    return { label: 'Семена', icon: Sprout };
  }
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return { label: 'Декор', icon: TreePine };
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return { label: 'Сад', icon: Sprout };
  }
  if (plant.placement === 'OUTDOOR') {
    return { label: 'Улица', icon: TreePine };
  }
  return { label: 'Дом', icon: Home };
}

function nextWateringDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return parseDateOnly(plant.nextWateringDate);
  }
  const last = parseDateOnly(plant.lastWateredDate);
  const next = new Date(last);
  next.setDate(next.getDate() + Math.max(1, plant.baseIntervalDays ?? 7));
  return next;
}

export function PlantHero({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  celebratePulse = 0
}: PlantHeroProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoSrc = previewDataUrl ?? plant.photoUrl ?? null;
  const meta = categoryMeta(plant);
  const Icon = meta.icon;

  const heroState = (() => {
    const today = startOfLocalDay(new Date());
    const next = nextWateringDate(plant);
    const target = startOfLocalDay(next);
    const daysLeft = Math.floor((target.getTime() - today.getTime()) / 86_400_000);
    return {
      status: getPlantStatusTone(daysLeft, plant.recommendationSource)
    };
  })();

  return (
    <motion.section
      className="theme-surface-1 relative overflow-hidden rounded-2xl border shadow-sm"
      initial={{ opacity: 0, y: 10, scale: 0.995 }}
      animate={celebratePulse > 0 ? { opacity: 1, y: 0, scale: [1, 1.015, 1] } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="relative h-[140px] w-full overflow-hidden">
        {photoSrc ? (
          <motion.img
            key={photoSrc}
            src={photoSrc}
            alt={plant.name}
            className="h-full w-full object-cover"
            initial={{ opacity: 0.35, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ios-background to-ios-surface-subtle dark:from-ios-background dark:to-ios-surface-subtle">
            <PlantAvatar
              name={plant.name}
              plant={plant}
              className="h-16 w-16 rounded-2xl border-2 border-ios-border/20"
              labelClassName="bottom-1 right-1 h-5 min-w-5 text-[10px]"
            />
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold backdrop-blur-sm ${heroState.status.containerClassName}`}>
            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${heroState.status.dotClassName}`} />
            {heroState.status.label}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-semibold leading-tight tracking-[-0.02em] text-white drop-shadow-md">
            {plant.name}
          </h2>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          void onPickPhoto(file);
          event.currentTarget.value = '';
        }}
      />

      {photoSrc ? (
        <button
          type="button"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
          disabled={photoUploading}
          onClick={() => {
            impactLight();
            inputRef.current?.click();
          }}
        >
          <Camera className="h-4 w-4 text-white" />
        </button>
      ) : null}
    </motion.section>
  );
}
