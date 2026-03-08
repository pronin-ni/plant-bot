import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

import { PlantHero } from '@/components/PlantHero';
import { hapticImpact } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface PlantDetailPageProps extends PropsWithChildren {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  onRequestDelete?: () => void;
}

function getNextDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return new Date(plant.nextWateringDate);
  }
  const last = new Date(plant.lastWateredDate);
  const next = new Date(last);
  next.setDate(next.getDate() + Math.max(1, plant.baseIntervalDays ?? 7));
  return next;
}

export function PlantDetailPage({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  onRequestDelete,
  children
}: PlantDetailPageProps) {
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');

  const isOverdue = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next = getNextDate(plant);
    const target = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    return target.getTime() < today.getTime();
  }, [plant]);

  useEffect(() => {
    if (!isOverdue) {
      return;
    }
    hapticImpact('rigid');
  }, [isOverdue]);

  return (
    <motion.div
      className="space-y-4"
      initial={isAndroid ? { opacity: 0, scale: 0.985 } : { opacity: 0, y: 10, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={isAndroid ? { duration: 0.24, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 340, damping: 30 }}
    >
      <PlantHero
        plant={plant}
        previewDataUrl={previewDataUrl}
        photoUploading={photoUploading}
        onPickPhoto={onPickPhoto}
        onRequestDelete={onRequestDelete}
      />

      <AnimatePresence>
        {isOverdue ? (
          <motion.div
            className="inline-flex w-full items-center gap-2 rounded-2xl border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 dark:border-red-500/55 dark:bg-red-500/15 dark:text-red-300"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <AlertTriangle className="h-4 w-4" />
            Полив просрочен — лучше полить сегодня
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05, duration: isAndroid ? 0.2 : 0.28 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
