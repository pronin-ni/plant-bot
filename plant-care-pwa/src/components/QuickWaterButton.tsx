import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';

interface QuickWaterButtonProps {
  isLoading?: boolean;
  isOverdue?: boolean;
  onWater: () => Promise<unknown> | unknown;
  onSuccess?: (meta: { rescued: boolean }) => void;
}

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  rotate: number;
  drift: number;
}

const CONFETTI_COLORS = ['#34C759', '#8BC34A', '#F59E0B', '#60A5FA', '#F472B6'];

function buildConfettiPieces(): ConfettiPiece[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: index,
    left: `${8 + index * 8}%`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    rotate: (index % 2 === 0 ? 1 : -1) * (18 + index * 7),
    drift: (index % 3 - 1) * 16
  }));
}

export function QuickWaterButton({
  isLoading = false,
  isOverdue = false,
  onWater,
  onSuccess
}: QuickWaterButtonProps) {
  const [burst, setBurst] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const confettiPieces = useMemo(() => buildConfettiPieces(), []);

  const handleClick = async () => {
    if (isLoading || isRunning) {
      return;
    }

    setIsRunning(true);
    hapticImpact('heavy');

    try {
      await onWater();

      setBurst(true);
      setConfirmed(true);
      onSuccess?.({ rescued: isOverdue });

      window.setTimeout(() => setBurst(false), 420);
      window.setTimeout(() => setConfirmed(false), 980);
    } catch {
      // Ошибка уже обрабатывается на уровне mutation (toast/haptic),
      // здесь просто откатываем локальный статус кнопки.
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <motion.div
      animate={{ scale: burst ? 1.035 : 1 }}
      transition={{ type: 'spring', stiffness: 430, damping: 30, mass: 1 }}
      className="relative"
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

            {confettiPieces.map((piece) => (
              <motion.span
                key={piece.id}
                className="absolute top-1/2 h-1.5 w-1.5 rounded-[2px]"
                style={{ left: piece.left, backgroundColor: piece.color }}
                initial={{ y: 4, x: 0, opacity: 0.95, rotate: 0, scale: 0.95 }}
                animate={{
                  y: -30 - piece.id * 3,
                  x: piece.drift,
                  opacity: 0,
                  rotate: piece.rotate,
                  scale: 1
                }}
                transition={{ duration: 0.62, ease: 'easeOut' }}
              />
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <Button
        variant="secondary"
        size="sm"
        className="w-full rounded-2xl bg-ios-accent/14 text-ios-accent shadow-[0_8px_24px_rgba(52,199,89,0.16)] hover:bg-ios-accent/22 android:rounded-[16px]"
        disabled={isLoading || isRunning}
        onClick={handleClick}
      >
        <AnimatePresence mode="wait" initial={false}>
          {confirmed ? (
            <motion.span
              key="done"
              className="inline-flex items-center gap-1.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <Check className="h-4 w-4" />
              Готово
            </motion.span>
          ) : (
            <motion.span
              key="water"
              className="inline-flex items-center gap-1.5"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <Droplets className="h-4 w-4" />
              {isLoading || isRunning ? 'Сохраняем...' : 'Полито'}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}
