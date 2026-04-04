import { motion } from 'framer-motion';
import { Home, SunMedium, TreePine } from 'lucide-react';

import { PlantAvatar } from '@/components/PlantAvatar';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import {
  getPlantCategoryLabel,
  getPlantEnvironmentLabel,
  getPlantReasonTone,
  getPlantSourceTone,
  getPlantStatusTone,
  seedStageLabel
} from '@/components/plants/plantRecommendationUi';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';
import { buildExplainabilityViewModel, getExplainabilityListLine } from '@/lib/explainability';
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
  if (plant.category === 'SEED_START' || plant.wateringProfile === 'SEED_START') return <SunMedium className={className} />;
  if (plant.category === 'OUTDOOR_DECORATIVE') return <TreePine className={className} />;
  if (plant.category === 'OUTDOOR_GARDEN') return <SunMedium className={className} />;
  return <Home className={className} />;
}

function nextWateringLabel(daysLeft: number, nextWateringText: string): string {
  if (daysLeft < 0) return `просрочено ${Math.abs(daysLeft)} дн.`;
  if (daysLeft === 0) return 'сегодня';
  if (daysLeft === 1) return 'завтра';
  return nextWateringText.replace(/^Полив\s+/i, '').replace(/^Пора\s+/i, '').replace(/^Просрочено\s+/i, '');
}

function hasWateredToday(plant: PlantDto): boolean {
  if (!plant.lastWateredDate) return false;
  return startOfLocalDay(parseDateOnly(plant.lastWateredDate)).getTime() === startOfLocalDay(new Date()).getTime();
}

function isSeedPlant(plant: PlantDto): boolean {
  return plant.category === 'SEED_START' || plant.wateringProfile === 'SEED_START';
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
  const explainability = buildExplainabilityViewModel({ plant });
  const hint = getExplainabilityListLine(explainability);
  const cycleProgress = Math.max(8, Math.min(100, Math.round(progress)));
  const hintTone = getPlantReasonTone(plant.recommendationSource);
  const wateredToday = hasWateredToday(plant);
  const seedPlant = isSeedPlant(plant);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      whileTap={{ scale: 0.995 }}
      className={`group theme-surface-1 relative flex flex-row items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgb(15_23_42/0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] ${pill.borderClassName}`}
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
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--secondary)/0.92)]">
        {plant.photoUrl ? (
          <img src={plant.photoUrl} alt={plant.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
        ) : (
          <PlantAvatar
            name={plant.name}
            plant={plant}
            className="h-full w-full rounded-lg border-0 shadow-none"
            labelClassName="bottom-0.5 left-0.5 h-4 min-w-4 px-1 text-[8px]"
            framed={false}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-sm font-semibold text-ios-text">{plant.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ios-subtext">
              <CategoryIcon plant={plant} className="h-3 w-3" />
              <span className="line-clamp-2 break-words">{getPlantCategoryLabel(plant)} · {getPlantEnvironmentLabel(plant)}</span>
            </p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pill.containerClassName}`}>
            <span className={`h-2 w-2 rounded-full ${pill.dotClassName}`} />
            {pill.label}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${source.className}`}>
            <SourceIcon className="h-3 w-3" />
            {seedPlant ? seedStageLabel(plant.seedStage) : source.shortLabel}
          </span>
          <span className="line-clamp-2 break-words text-[11px] text-ios-subtext">
            {seedPlant ? '' : nextWateringLabel(daysLeft, nextWateringText)}
          </span>
        </div>

        <div className={`mt-1.5 flex items-center gap-2 rounded-md px-2 py-1 ${hintTone}`}>
          <p className="min-w-0 flex-1 break-words text-[11px] leading-4 text-ios-text">
            {seedPlant ? (plant.seedSummary?.trim() || hint) : hint}
          </p>
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--secondary)/0.96)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cycleProgress > 70 ? 'bg-emerald-500' : cycleProgress > 40 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${cycleProgress}%` }}
            />
          </div>
        </div>
      </div>

      <div
        className="shrink-0"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {seedPlant ? (
          <button
            type="button"
            className="theme-surface-subtle h-10 rounded-lg border px-3 text-xs font-medium text-ios-text"
            onClick={onOpen}
          >
            Открыть
          </button>
        ) : (
          <QuickWaterButton
            isLoading={isWatering}
            isOverdue={daysLeft <= 0}
            disabled={wateredToday}
            disabledLabel="Полито"
            onWater={onWater}
          />
        )}
      </div>
    </motion.article>
  );
}
