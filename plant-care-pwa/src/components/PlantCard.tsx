import { motion } from 'framer-motion';
import { Droplets, Home, Image as ImageIcon, SunMedium, TreePine } from 'lucide-react';

import { QuickWaterButton } from '@/components/QuickWaterButton';
import type { PlantDto } from '@/types/api';

interface PlantCardProps {
  plant: PlantDto;
  progress: number;
  daysLeft: number;
  nextWateringText: string;
  isWatering?: boolean;
  onWater: () => Promise<unknown> | unknown;
  onOpen: () => void;
}

function categoryLabel(plant: PlantDto): string {
  switch (plant.category) {
    case 'OUTDOOR_DECORATIVE':
      return 'Декор';
    case 'OUTDOOR_GARDEN':
      return 'Сад';
    default:
      return 'Дом';
  }
}

function CategoryIcon({ plant, className }: { plant: PlantDto; className?: string }) {
  if (plant.category === 'OUTDOOR_DECORATIVE') return <TreePine className={className} />;
  if (plant.category === 'OUTDOOR_GARDEN') return <SunMedium className={className} />;
  return <Home className={className} />;
}

function statusPill(daysLeft: number): {
  text: string;
  cls: string;
  dot: string;
  border: string;
  progress: string;
} {
  if (daysLeft <= 0) {
    return {
      text: 'Нужно полить',
      cls: 'bg-red-50 text-red-600 dark:bg-red-950/35 dark:text-red-300',
      dot: 'bg-red-500',
      border: 'border-red-200/80 dark:border-red-800/70',
      progress: 'bg-red-500'
    };
  }
  if (daysLeft <= 2) {
    return {
      text: 'Скоро полив',
      cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/35 dark:text-amber-300',
      dot: 'bg-amber-500',
      border: 'border-amber-200/80 dark:border-amber-800/70',
      progress: 'bg-amber-500'
    };
  }
  return {
    text: 'В порядке',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200/80 dark:border-emerald-800/70',
    progress: 'bg-emerald-500'
  };
}

export function PlantCard({
  plant,
  progress,
  daysLeft,
  nextWateringText,
  isWatering = false,
  onWater,
  onOpen
}: PlantCardProps) {
  const moistureLeft = Math.max(0, Math.min(100, 100 - Math.round(progress)));
  const pill = statusPill(daysLeft);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.992 }}
      className={`flex flex-col gap-3 rounded-2xl border bg-white/95 p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${pill.border}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {plant.photoUrl ? (
            <img src={plant.photoUrl} alt={plant.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-slate-900">{plant.name}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                <CategoryIcon plant={plant} className="h-3.5 w-3.5" />
                {categoryLabel(plant)}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.cls}`}>
              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
              {pill.text}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-slate-50/85 px-3 py-2 dark:bg-zinc-900/70">
        <div className="flex items-center justify-between text-sm text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <Droplets className="h-4 w-4 text-emerald-500" />
            {moistureLeft}% влаги
          </span>
          <span className="text-xs text-slate-500">{nextWateringText}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/90 dark:bg-zinc-950/70">
          <div
            className={`h-full rounded-full ${pill.progress}`}
            style={{ width: `${Math.min(100, Math.max(0, 100 - moistureLeft))}%` }}
          />
        </div>
      </div>

      <div
        className="mt-auto"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <QuickWaterButton isLoading={isWatering} isOverdue={daysLeft <= 0} onWater={onWater} />
      </div>
    </motion.article>
  );
}
