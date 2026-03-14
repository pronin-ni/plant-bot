import { motion } from 'framer-motion';
import { Home, Image as ImageIcon, SunMedium, TreePine } from 'lucide-react';

import { QuickWaterButton } from '@/components/QuickWaterButton';
import {
  getPlantCategoryLabel,
  getPlantEnvironmentLabel,
  getPlantRecommendationHint,
  getPlantReasonTone,
  getPlantSourceTone,
  getPlantStatusTone
} from '@/components/plants/plantRecommendationUi';
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

function CategoryIcon({ plant, className }: { plant: PlantDto; className?: string }) {
  if (plant.category === 'OUTDOOR_DECORATIVE') return <TreePine className={className} />;
  if (plant.category === 'OUTDOOR_GARDEN') return <SunMedium className={className} />;
  return <Home className={className} />;
}

function nextWateringLabel(daysLeft: number, nextWateringText: string): string {
  if (daysLeft < 0) {
    return `С задержкой на ${Math.abs(daysLeft)} дн.`;
  }
  if (daysLeft === 0) {
    return 'Сегодня';
  }
  if (daysLeft === 1) {
    return 'Завтра';
  }
  return nextWateringText
    .replace(/^Полив\s+/i, '')
    .replace(/^Пора\s+/i, '')
    .replace(/^Просрочено\s+/i, '');
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
  const pill = getPlantStatusTone(daysLeft, plant.recommendationSource);
  const source = getPlantSourceTone(plant.recommendationSource);
  const SourceIcon = source.icon;
  const hint = getPlantRecommendationHint(plant);
  const cycleProgress = Math.max(8, Math.min(100, Math.round(progress)));
  const hintTone = getPlantReasonTone(plant.recommendationSource);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.988 }}
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-[28px] border bg-white/95 p-3.5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${pill.borderClassName}`}
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_left,rgba(52,199,89,0.10),transparent_52%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_48%)] opacity-90" />
      <div className="relative flex gap-3.5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-slate-100 shadow-inner">
          {plant.photoUrl ? (
            <img src={plant.photoUrl} alt={plant.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-slate-900 sm:text-base">{plant.name}</p>
              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <CategoryIcon plant={plant} className="h-3.5 w-3.5" />
                {getPlantCategoryLabel(plant)} · {getPlantEnvironmentLabel(plant)}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm ${pill.containerClassName}`}>
              <span className={`h-2 w-2 rounded-full ${pill.dotClassName}`} />
              {pill.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm ${source.className}`}>
              <SourceIcon className="h-3.5 w-3.5" />
              {source.shortLabel}
            </span>
            <span className="text-xs text-slate-500">Следующий полив: {nextWateringLabel(daysLeft, nextWateringText)}</span>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.22 }}
        className={`space-y-2 rounded-[22px] px-3 py-3 ${hintTone}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400/90">Почему сейчас</p>
            <p className="mt-1 line-clamp-2 text-sm leading-5">{hint}</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Цикл полива</span>
            <span>{Math.max(0, Math.min(100, cycleProgress))}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/90 dark:bg-zinc-950/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400"
              style={{ width: `${cycleProgress}%` }}
            />
          </div>
        </div>
      </motion.div>

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
