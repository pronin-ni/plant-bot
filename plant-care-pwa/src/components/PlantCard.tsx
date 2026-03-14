import { motion } from 'framer-motion';
import { Home, SunMedium, TreePine } from 'lucide-react';

import { PlantAvatar } from '@/components/PlantAvatar';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import {
  getPlantCategoryLabel,
  getPlantEnvironmentLabel,
  getPlantRecommendationHint,
  getPlantReasonTone,
  getPlantSourceTone,
  getPlantStatusTone
} from '@/components/plants/plantRecommendationUi';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';
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

function hasWateredToday(plant: PlantDto): boolean {
  if (!plant.lastWateredDate) {
    return false;
  }
  return startOfLocalDay(parseDateOnly(plant.lastWateredDate)).getTime() === startOfLocalDay(new Date()).getTime();
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
  const wateredToday = hasWateredToday(plant);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.988 }}
      className={`group theme-surface-1 relative flex flex-col gap-3 overflow-hidden rounded-[28px] border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgb(15_23_42/0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] ${pill.borderClassName}`}
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_52%),radial-gradient(circle_at_top_right,hsl(var(--accent)/0.12),transparent_48%)] opacity-90" />
      <div className="relative flex gap-3.5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-[hsl(var(--secondary)/0.92)] shadow-inner">
          {plant.photoUrl ? (
            <img src={plant.photoUrl} alt={plant.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
          ) : (
            <PlantAvatar
              name={plant.name}
              plant={plant}
              className="h-full w-full rounded-[22px] border-0 shadow-none"
              labelClassName="bottom-1.5 left-1.5 h-6 min-w-6 px-1.5 text-[10px]"
              framed={false}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-ios-text sm:text-base">{plant.name}</p>
              <p className="inline-flex items-center gap-1 text-xs font-medium text-ios-subtext">
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
            <span className="text-xs text-ios-subtext">Следующий полив: {nextWateringLabel(daysLeft, nextWateringText)}</span>
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
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-ios-subtext">Почему сейчас</p>
            <p className="mt-1 line-clamp-2 text-sm leading-5">{hint}</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-ios-subtext">
            <span>Цикл полива</span>
            <span>{Math.max(0, Math.min(100, cycleProgress))}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary)/0.96)]">
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
        <QuickWaterButton
          isLoading={isWatering}
          isOverdue={daysLeft <= 0}
          disabled={wateredToday}
          disabledLabel="Уже полито сегодня"
          onWater={onWater}
        />
      </div>
    </motion.article>
  );
}
