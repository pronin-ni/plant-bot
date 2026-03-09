import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { PlantHero } from '@/components/PlantHero';
import { hapticImpact } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface PlantDetailPageProps extends PropsWithChildren {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  onRequestDelete?: () => void;
  wateringPulse?: number;
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
  wateringPulse = 0,
  children
}: PlantDetailPageProps) {
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');
  const prefersReducedMotion = useReducedMotion();
  const [enterWave, setEnterWave] = useState(true);

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

  useEffect(() => {
    hapticImpact('light');
    navigator.vibrate?.(50);
    const timer = window.setTimeout(() => setEnterWave(false), 820);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="relative space-y-4"
      initial={isAndroid ? { opacity: 0, scale: 0.985 } : { opacity: 0, y: 10, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={isAndroid ? { duration: 0.24, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 340, damping: 30 }}
    >
      <AnimatePresence>
        {enterWave && !prefersReducedMotion ? (
          <motion.span
            key="detail-enter-wave"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[28px]"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.82, ease: 'easeOut' }}
          >
            <motion.span
              className="absolute bottom-[-48px] left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-400/30"
              initial={{ scale: 0.2, opacity: 0.85 }}
              animate={{ scale: 6.2, opacity: 0 }}
              transition={{ duration: 0.82, ease: 'easeOut' }}
            />
          </motion.span>
        ) : null}

        {wateringPulse > 0 ? (
          <motion.span
            key={`detail-wave-${wateringPulse}`}
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[28px]"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <motion.span
              className="absolute bottom-[-40px] left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-emerald-400/35"
              initial={{ scale: 0.15, opacity: 0.85 }}
              animate={{ scale: 7.2, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <PlantHero
        plant={plant}
        previewDataUrl={previewDataUrl}
        photoUploading={photoUploading}
        onPickPhoto={onPickPhoto}
        onRequestDelete={onRequestDelete}
        celebratePulse={wateringPulse}
      />

      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={
          prefersReducedMotion
            ? { duration: 0.12 }
            : isAndroid
              ? { duration: 0.24, ease: [0.2, 0, 0, 1] }
              : { type: 'spring', stiffness: 400, damping: 30, delay: 0.06 }
        }
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
