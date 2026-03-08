import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { CloudRain, Home, Image as ImageIcon, SunMedium, TreePine } from 'lucide-react';

import { ProgressRing } from '@/components/common/progress-ring';
import { QuickWaterButton } from '@/components/QuickWaterButton';
import { cn } from '@/lib/cn';
import type { PlantDto } from '@/types/api';

interface PlantCardProps {
  plant: PlantDto;
  progress: number;
  nextWateringText: string;
  daysLeft: number;
  nextDateLabel: string;
  isWatering?: boolean;
  onWater: () => Promise<unknown> | unknown;
  onOpen: () => void;
}

function categoryLabel(plant: PlantDto): string {
  switch (plant.category) {
    case 'OUTDOOR_DECORATIVE':
      return 'Декоративное';
    case 'OUTDOOR_GARDEN':
      return 'Садовое';
    default:
      return 'Домашнее';
  }
}

function CategoryIcon({ plant, className }: { plant: PlantDto; className?: string }) {
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return <TreePine className={className} />;
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return <SunMedium className={className} />;
  }
  return <Home className={className} />;
}

function categoryShell(plant: PlantDto) {
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return 'border-emerald-300/45 bg-gradient-to-br from-sky-100/60 via-emerald-100/45 to-lime-100/55 dark:from-sky-900/30 dark:via-emerald-900/20 dark:to-lime-900/30';
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return 'border-amber-300/45 bg-gradient-to-br from-amber-100/55 via-lime-100/35 to-stone-100/65 dark:from-amber-900/35 dark:via-lime-900/20 dark:to-stone-900/35';
  }
  return 'border-rose-200/45 bg-gradient-to-br from-orange-100/45 via-rose-100/35 to-white/65 dark:from-orange-900/25 dark:via-rose-900/20 dark:to-zinc-900/45';
}

export function PlantCard({
  plant,
  progress,
  nextWateringText,
  daysLeft,
  nextDateLabel,
  isWatering = false,
  onWater,
  onOpen
}: PlantCardProps) {
  const critical = daysLeft <= 0;
  const [rescueFlash, setRescueFlash] = useState(false);
  const [ringPulse, setRingPulse] = useState(false);
  const [thanksVisible, setThanksVisible] = useState(false);

  return (
    <motion.article
      className={cn(
        'relative flex min-h-[236px] flex-col overflow-hidden rounded-ios-card border p-3.5 shadow-ios backdrop-blur-[22px] outline-none focus-visible:ring-2 focus-visible:ring-ios-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        categoryShell(plant)
      )}
      initial={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 330, damping: 27, mass: 1 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: rescueFlash ? [1, 1.02, 1] : 1,
        boxShadow: rescueFlash
          ? ['0 8px 24px rgba(52,199,89,0.12)', '0 18px 44px rgba(52,199,89,0.35)', '0 8px 24px rgba(52,199,89,0.12)']
          : '0 8px 24px rgba(0,0,0,0.12)'
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {plant.category === 'OUTDOOR_DECORATIVE' ? (
        // Декоративные: лёгкая анимация "росы".
        <div className="pointer-events-none absolute inset-0">
          <motion.span
            className="absolute left-5 top-8 h-1.5 w-1.5 rounded-full bg-white/75"
            animate={{ y: [0, 3, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute right-6 top-14 h-1.5 w-1.5 rounded-full bg-white/70"
            animate={{ y: [0, 4, 0], opacity: [0.5, 0.95, 0.5] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      ) : null}

      <AnimatePresence>
        {ringPulse ? (
          <motion.span
            className="pointer-events-none absolute inset-0 z-[1] rounded-ios-card bg-emerald-400/18"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        ) : null}
      </AnimatePresence>

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold text-ios-text">{plant.name}</h3>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ios-subtext">
            <CategoryIcon plant={plant} className="h-3.5 w-3.5" />
            {categoryLabel(plant)}
          </p>
        </div>

        <motion.div
          layoutId={`plant-photo-${plant.id}`}
          className="h-12 w-12 overflow-hidden rounded-xl border border-white/55 bg-white/45 shadow-[0_6px_16px_rgba(0,0,0,0.08)]"
        >
          {plant.photoUrl ? (
            <img src={plant.photoUrl} alt={plant.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ios-subtext">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
        </motion.div>
      </div>

      <div className="relative mb-2 flex items-center justify-center">
        <motion.div
          animate={ringPulse ? { scale: [1, 1.12, 1], rotate: [0, -2.5, 2.5, 0] } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        >
          <ProgressRing value={progress} size={86} stroke={8} label="до полива" />
        </motion.div>

        <AnimatePresence>
          {thanksVisible ? (
            <motion.span
              className="pointer-events-none absolute -top-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: -12, scale: 1 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ type: 'spring', stiffness: 340, damping: 25 }}
            >
              Спасибо! 🌿
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <p className={cn('text-center text-[12px] font-medium', critical ? 'text-red-500' : 'text-ios-subtext')}>
        {nextWateringText}
      </p>
      <p className={cn('mt-0.5 text-center text-[11px]', critical ? 'text-red-400' : 'text-ios-subtext')}>
        {nextDateLabel}
      </p>

      {plant.category === 'OUTDOOR_GARDEN' ? (
        <div className="mt-2 inline-flex items-center justify-center gap-2 text-[11px] text-ios-subtext">
          <span className="inline-flex items-center gap-1 rounded-full border border-ios-border/55 bg-white/45 px-2 py-0.5">
            <SunMedium className="h-3 w-3" /> солнце
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-ios-border/55 bg-white/45 px-2 py-0.5">
            <CloudRain className="h-3 w-3" /> осадки
          </span>
        </div>
      ) : null}

      <div className="mt-auto pt-2">
        <div onClick={(event) => event.stopPropagation()}>
          <QuickWaterButton
            isLoading={isWatering}
            isOverdue={critical}
            onWater={onWater}
            onSuccess={({ rescued }) => {
              setRingPulse(true);
              setThanksVisible(true);
              window.setTimeout(() => setRingPulse(false), 720);
              window.setTimeout(() => setThanksVisible(false), 900);

              if (!rescued) {
                return;
              }
              setRescueFlash(true);
              window.setTimeout(() => setRescueFlash(false), 760);
            }}
          />
        </div>
      </div>
    </motion.article>
  );
}
