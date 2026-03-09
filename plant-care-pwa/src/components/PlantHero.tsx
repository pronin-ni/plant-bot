import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Home, Sprout, TreePine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface PlantHeroProps {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  celebratePulse?: number;
}

function categoryMeta(plant: PlantDto): { label: string; icon: typeof Home } {
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return { label: 'Декоративное уличное', icon: TreePine };
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return { label: 'Садовое', icon: Sprout };
  }
  if (plant.placement === 'OUTDOOR') {
    return { label: 'Уличное растение', icon: TreePine };
  }
  return { label: 'Домашнее растение', icon: Home };
}

function nextWateringDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return new Date(plant.nextWateringDate);
  }
  const last = new Date(plant.lastWateredDate);
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

  const status = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next = nextWateringDate(plant);
    const target = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    if (target.getTime() < today.getTime()) {
      return { label: 'Нужно полить', className: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' };
    }
    return { label: 'В порядке', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' };
  }, [plant]);

  return (
    <motion.section
      className="relative overflow-hidden rounded-3xl border border-ios-border/60 bg-white/70 shadow-sm backdrop-blur-ios dark:bg-zinc-950/75"
      initial={{ opacity: 0, y: 10, scale: 0.995 }}
      animate={celebratePulse > 0 ? { opacity: 1, y: 0, scale: [1, 1.015, 1] } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="relative h-[248px] w-full overflow-hidden">
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
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(52,199,89,0.26),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(255,205,120,0.22),transparent_45%),linear-gradient(145deg,rgba(248,252,247,0.85),rgba(233,246,236,0.72))] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(52,199,89,0.28),transparent_46%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.2),transparent_46%),linear-gradient(145deg,rgba(25,34,29,0.88),rgba(18,25,21,0.84))]">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="rounded-full bg-white/70 p-4 text-emerald-700 shadow-sm dark:bg-zinc-900/60 dark:text-emerald-300">
                <Sprout className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ios-text">Добавьте фото растения</p>
                <p className="mt-1 text-xs text-ios-subtext">Так проще отслеживать рост и изменения листьев.</p>
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${status.className}`}>
            {status.label}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="h-10 rounded-full border border-white/35 bg-black/25 px-3 text-xs text-white backdrop-blur-md hover:bg-black/35"
            disabled={photoUploading}
            onClick={() => {
              hapticImpact('light');
              inputRef.current?.click();
            }}
          >
            <Camera className="mr-1.5 h-4 w-4" />
            {photoUploading ? 'Загрузка...' : photoSrc ? 'Сменить фото' : 'Добавить фото'}
          </Button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="inline-flex items-center gap-1 rounded-full border border-white/35 bg-black/25 px-2.5 py-1 text-[11px] backdrop-blur-md">
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">{plant.name}</h2>
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
    </motion.section>
  );
}
