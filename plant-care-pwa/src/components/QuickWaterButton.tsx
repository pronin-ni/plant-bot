import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';

interface QuickWaterButtonProps {
  isLoading?: boolean;
  isOverdue?: boolean;
  onWater: () => Promise<unknown> | unknown;
  onSuccess?: (meta: { rescued: boolean }) => void;
  onBurstStart?: () => void;
  onBurstEnd?: () => void;
}

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  rotate: number;
  drift: number;
}

interface DropPiece {
  id: number;
  left: string;
  delay: number;
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

function buildWaterDrops(): DropPiece[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: index,
    left: `${10 + index * 10}%`,
    delay: index * 0.035
  }));
}

export function QuickWaterButton({
  isLoading = false,
  isOverdue = false,
  onWater,
  onSuccess,
  onBurstStart,
  onBurstEnd
}: QuickWaterButtonProps) {
  const [burst, setBurst] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const confettiPieces = useMemo(() => buildConfettiPieces(), []);
  const waterDrops = useMemo(() => buildWaterDrops(), []);

  const handleClick = async () => {
    if (isLoading || isRunning) {
      return;
    }

    setIsRunning(true);
    hapticImpact('heavy');
    navigator.vibrate?.([50, 30, 50]);

    try {
      await onWater();

      setBurst(true);
      setConfirmed(true);
      onBurstStart?.();
      onSuccess?.({ rescued: isOverdue });

      window.setTimeout(() => {
        setBurst(false);
        onBurstEnd?.();
      }, 840);
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
            {!prefersReducedMotion ? (
              <>
                {waterDrops.map((piece) => (
                  <motion.span
                    key={`drop-${piece.id}`}
                    className="absolute top-[-8px] h-2 w-1.5 rounded-b-full rounded-t-[60%] bg-cyan-300/90"
                    style={{ left: piece.left }}
                    initial={{ y: -6, opacity: 0 }}
                    animate={{ y: 26, opacity: [0, 1, 0.2] }}
                    transition={{ duration: 0.42, delay: piece.delay, ease: 'easeIn' }}
                  />
                ))}
                <motion.span
                  className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/30"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: [0.3, 1.1, 0.8], opacity: [0, 0.7, 0] }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                />
              </>
            ) : null}

            {confettiPieces.map((piece) => (
              <motion.span
                key={piece.id}
                className="absolute top-1/2 h-1.5 w-2 rounded-[4px]"
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

            <motion.span
              className="absolute left-1/2 top-[-18px] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-emerald-600 dark:text-emerald-300"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: -8, scale: 1 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            >
              Спасибо! 🌿
            </motion.span>
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
