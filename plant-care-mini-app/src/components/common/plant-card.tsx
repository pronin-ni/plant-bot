import { motion } from 'framer-motion';
import { Home, TreePine } from 'lucide-react';

import { ProgressRing } from '@/components/common/progress-ring';
import { WaterButton } from '@/components/common/water-button';
import { cn } from '@/lib/cn';
import type { PlantDto } from '@/types/api';

interface PlantCardProps {
  plant: PlantDto;
  progress: number;
  nextWateringText: string;
  isWatering?: boolean;
  onWater: () => void;
  onOpen: () => void;
}

export function PlantCard({ plant, progress, nextWateringText, isWatering = false, onWater, onOpen }: PlantCardProps) {
  const isOutdoor = plant.placement === 'OUTDOOR';

  return (
    <motion.article
      className={cn(
        'ios-blur-card flex min-h-[214px] flex-col p-4',
        'transition-transform duration-150 active:scale-[0.985]'
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 27, mass: 1 }}
      onClick={onOpen}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold text-ios-text">{plant.name}</h3>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ios-subtext">
            {isOutdoor ? <TreePine className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
            {isOutdoor ? 'Уличное' : 'Домашнее'}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-center">
        <ProgressRing value={progress} label="цикл" />
      </div>

      <p className="mb-3 text-center text-[12px] text-ios-subtext">{nextWateringText}</p>

      <div className="mt-auto">
        <div onClick={(event) => event.stopPropagation()}>
          <WaterButton isLoading={isWatering} onClick={onWater} />
        </div>
      </div>
    </motion.article>
  );
}
