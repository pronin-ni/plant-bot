import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Droplets, ExternalLink, Leaf } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { impactHeavy, impactLight, success } from '@/lib/haptics';

export interface PlantActionEvent {
  date: string;
  plantId: number;
  plantName: string;
  isToday?: boolean;
  isOverdue?: boolean;
}

interface PlantActionItemProps {
  event: PlantActionEvent;
  pending?: boolean;
  onComplete: (plantId: number) => Promise<unknown> | unknown;
  onOpenPlant: (plantId: number) => void;
}

interface BurstPiece {
  id: number;
  left: string;
  drift: number;
  color: string;
}

const BURST_COLORS = ['#34C759', '#4ADE80', '#60A5FA', '#F59E0B', '#F472B6'];

function buildBurstPieces(): BurstPiece[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: `${9 + i * 8}%`,
    drift: (i % 3 - 1) * 14,
    color: BURST_COLORS[i % BURST_COLORS.length]
  }));
}

export function PlantActionItem({ event, pending = false, onComplete, onOpenPlant }: PlantActionItemProps) {
  const [localRunning, setLocalRunning] = useState(false);
  const [burst, setBurst] = useState(false);
  const [done, setDone] = useState(false);
  const [thankYou, setThankYou] = useState(false);

  const pieces = useMemo(() => buildBurstPieces(), []);

  const statusClass = event.isOverdue
    ? 'theme-badge-danger'
    : event.isToday
      ? 'theme-badge-warning'
      : 'theme-badge-success';

  const statusLabel = event.isOverdue
    ? 'Срочно'
    : event.isToday
      ? 'Сегодня'
      : 'Планово';

  const handleComplete = async () => {
    if (pending || localRunning) {
      return;
    }

    setLocalRunning(true);
    impactHeavy();

    try {
      await onComplete(event.plantId);
      setBurst(true);
      setDone(true);
      setThankYou(true);
      success();
      window.setTimeout(() => setBurst(false), 420);
      window.setTimeout(() => setDone(false), 1100);
      window.setTimeout(() => setThankYou(false), 1200);
    } finally {
      setLocalRunning(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 330, damping: 28 }}
      className="theme-surface-1 relative overflow-hidden rounded-2xl border p-3"
    >
      <AnimatePresence>
        {burst ? (
          <motion.span
            className="pointer-events-none absolute inset-0 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="water-drop water-drop-1" />
            <span className="water-drop water-drop-2" />
            <span className="water-drop water-drop-3" />
            {pieces.map((piece) => (
              <motion.span
                key={piece.id}
                className="absolute top-1/2 h-1.5 w-1.5 rounded-[2px]"
                style={{ left: piece.left, backgroundColor: piece.color }}
                initial={{ y: 4, x: 0, opacity: 0.95, rotate: 0 }}
                animate={{ y: -28 - piece.id * 2, x: piece.drift, opacity: 0, rotate: 120 }}
                transition={{ duration: 0.58, ease: 'easeOut' }}
              />
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div className="relative z-20 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            impactLight();
            onOpenPlant(event.plantId);
          }}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="theme-surface-subtle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold text-ios-text">
            {event.plantName.slice(0, 1).toUpperCase()}
          </span>

          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ios-text">{event.plantName}</span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ios-subtext">
              <ExternalLink className="h-3.5 w-3.5" />
              Открыть карточку
            </span>
          </span>
        </button>

        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="relative z-20 mt-3 flex items-center gap-2">
        <div className="theme-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-ios-subtext">
          <Droplets className="h-3.5 w-3.5 text-ios-accent" />
          Полив
        </div>

        <Button
          variant="secondary"
          className="ml-auto h-9 px-3"
          disabled={pending || localRunning}
          onClick={() => {
            void handleComplete();
          }}
        >
          {done ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              Готово
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {pending || localRunning ? 'Сохраняем...' : 'Полить'}
            </span>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {thankYou ? (
          <motion.div
            className="theme-surface-success pointer-events-none absolute bottom-2 left-3 z-20 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            <motion.span
              animate={{ rotate: [0, 15, -12, 9, 0] }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
            >
              <Leaf className="h-3.5 w-3.5" />
            </motion.span>
            Спасибо за полив
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}
