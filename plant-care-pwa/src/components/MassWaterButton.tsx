import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { impactLight, impactMedium, impactHeavy } from '@/lib/haptics';

interface MassWaterButtonProps {
  disabled?: boolean;
  pending?: boolean;
  count: number;
  onRun: () => Promise<unknown> | unknown;
}

interface BurstPiece {
  id: number;
  left: string;
  drift: number;
  color: string;
}

const BURST_COLORS = ['#34C759', '#4ADE80', '#60A5FA', '#F59E0B', '#F472B6'];

function buildBurstPieces(): BurstPiece[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: `${4 + i * 6.8}%`,
    drift: (i % 4 - 1.5) * 16,
    color: BURST_COLORS[i % BURST_COLORS.length]
  }));
}

export function MassWaterButton({ disabled = false, pending = false, count, onRun }: MassWaterButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [wave, setWave] = useState(false);
  const [done, setDone] = useState(false);
  const burst = useMemo(() => buildBurstPieces(), []);

  const handleClick = async () => {
    if (disabled || pending || isRunning || count <= 0) {
      return;
    }

    setIsRunning(true);
    impactHeavy();

    try {
      await onRun();
      setWave(true);
      setDone(true);
      window.setTimeout(() => setWave(false), 700);
      window.setTimeout(() => setDone(false), 1200);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <motion.div
      className="relative"
      animate={{ scale: wave ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <AnimatePresence>
        {wave ? (
          <motion.span
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              className="absolute inset-x-[-12%] bottom-[-16px] h-12 rounded-[999px] bg-ios-accent/30"
              initial={{ y: 28, scaleX: 0.8, opacity: 0.45 }}
              animate={{ y: -42, scaleX: 1.18, opacity: 0 }}
              transition={{ duration: 0.72, ease: 'easeOut' }}
            />

            <span className="water-drop water-drop-1" />
            <span className="water-drop water-drop-2" />
            <span className="water-drop water-drop-3" />

            {burst.map((piece) => (
              <motion.span
                key={piece.id}
                className="absolute top-1/2 h-1.5 w-1.5 rounded-[2px]"
                style={{ left: piece.left, backgroundColor: piece.color }}
                initial={{ y: 6, x: 0, opacity: 0.95, rotate: 0 }}
                animate={{ y: -34 - piece.id * 1.8, x: piece.drift, opacity: 0, rotate: 120 }}
                transition={{ duration: 0.62, ease: 'easeOut' }}
              />
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <Button
        className="h-10 w-full"
        disabled={disabled || pending || isRunning || count <= 0}
        onClick={handleClick}
      >
        {done ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            Выполнено
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {pending || isRunning ? <CheckCircle2 className="h-4 w-4" /> : <Droplets className="h-4 w-4" />}
            {pending || isRunning ? 'Отмечаем...' : `Отметить всё выполненным (${count})`}
          </span>
        )}
      </Button>
    </motion.div>
  );
}
