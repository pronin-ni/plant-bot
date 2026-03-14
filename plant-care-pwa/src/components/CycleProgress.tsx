import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';
import { hapticImpact } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface CycleProgressProps {
  plant: PlantDto;
  progress: number;
  isWatering?: boolean;
  onWater: () => Promise<unknown> | unknown;
  onSuccess?: () => void;
}

function getNextDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return parseDateOnly(plant.nextWateringDate);
  }
  const last = parseDateOnly(plant.lastWateredDate);
  const next = new Date(last);
  next.setDate(next.getDate() + Math.max(1, plant.baseIntervalDays ?? 7));
  return next;
}

function getDaysLeft(plant: PlantDto): number {
  const today = startOfLocalDay(new Date());
  const next = getNextDate(plant);
  const target = startOfLocalDay(next);
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000);
}

function urgencyClass(daysLeft: number): string {
  if (daysLeft <= 0) {
    return 'text-red-500 dark:text-red-400';
  }
  if (daysLeft <= 2) {
    return 'text-amber-500 dark:text-amber-400';
  }
  return 'text-emerald-600 dark:text-emerald-400';
}

function formatNextLabel(plant: PlantDto): string {
  const next = getNextDate(plant);
  return `Следующий полив: ${next.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}`;
}

function formatLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) {
    return `Просрочено на ${Math.abs(daysLeft)} дн.`;
  }
  if (daysLeft === 0) {
    return 'Пора поливать сегодня';
  }
  if (daysLeft === 1) {
    return 'Полив завтра';
  }
  return `Полив через ${daysLeft} дн.`;
}

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  drift: number;
}

const CONFETTI = ['#34C759', '#22C55E', '#60A5FA', '#F59E0B', '#F472B6'];

function confettiPieces(): ConfettiPiece[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${5 + i * 8}%`,
    color: CONFETTI[i % CONFETTI.length],
    drift: (i % 4 - 1.5) * 15
  }));
}

export function CycleProgress({ plant, progress, isWatering = false, onWater, onSuccess }: CycleProgressProps) {
  const [burst, setBurst] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [wave, setWave] = useState(false);
  const [aliveText, setAliveText] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const daysLeft = useMemo(() => getDaysLeft(plant), [plant]);
  const p = Math.max(0, Math.min(100, progress));

  const radius = 56;
  const size = 132;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (p / 100) * circumference;

  const pieces = useMemo(() => confettiPieces(), []);

  const handleWater = async () => {
    if (isWatering || running) {
      return;
    }
    setRunning(true);
    hapticImpact('rigid');
    navigator.vibrate?.(300);
    try {
      await onWater();
      setBurst(true);
      setConfirmed(true);
      setWave(true);
      setAliveText(true);
      onSuccess?.();
      window.setTimeout(() => setBurst(false), 700);
      window.setTimeout(() => setWave(false), 820);
      window.setTimeout(() => setAliveText(false), 940);
      window.setTimeout(() => setConfirmed(false), 980);
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.section
      className="ios-blur-card relative overflow-hidden p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <AnimatePresence>
        {wave ? (
          <motion.span
            className="pointer-events-none absolute inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              className="absolute left-1/2 top-[78%] h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-300/35"
              initial={{ scale: 0.1, opacity: 0.8 }}
              animate={{ scale: 5.2, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ios-caption text-ios-subtext">Состояние цикла</p>
          <p className={`mt-1 text-sm font-semibold ${urgencyClass(daysLeft)}`}>{formatLeftLabel(daysLeft)}</p>
          <p className="mt-1 text-xs text-ios-subtext">{formatNextLabel(plant)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center">
        <div className="relative">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <defs>
              <linearGradient id="cycle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34C759" />
                <stop offset="58%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#EF4444" />
              </linearGradient>
            </defs>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="12" />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#cycle-gradient)"
              strokeWidth="12"
              strokeLinecap="round"
              style={{ strokeDasharray: circumference, strokeDashoffset: dashoffset }}
              animate={{ strokeDashoffset: dashoffset }}
              transition={{ type: 'spring', stiffness: 190, damping: 28 }}
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              animate={{
                y: burst ? [0, -3, 0] : 0,
                scale: burst ? [1, 1.08, 1] : 1,
                rotate: burst && !prefersReducedMotion ? [0, -3, 3, -2, 2, 0] : 0
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              <Droplets className="mx-auto h-5 w-5 text-ios-accent" />
            </motion.div>
            <p className="mt-1 text-xl font-semibold text-ios-text">{Math.round(p)}%</p>
            <p className="text-[11px] text-ios-subtext">влага</p>
          </div>
        </div>
      </div>

      <motion.div className="relative mt-3" animate={{ scale: burst ? 1.02 : 1 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
        <AnimatePresence>
            {burst ? (
              <motion.span className="pointer-events-none absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="water-drop water-drop-1" />
              <span className="water-drop water-drop-2" />
              <span className="water-drop water-drop-3" />
              {pieces.map((piece) => (
                <motion.span
                  key={piece.id}
                  className="absolute top-1/2 h-1.5 w-1.5 rounded-[2px]"
                  style={{ left: piece.left, backgroundColor: piece.color }}
                  initial={{ y: 2, x: 0, opacity: 0.95, rotate: 0 }}
                  animate={{ y: -34 - piece.id * 2, x: piece.drift, opacity: 0, rotate: 120 }}
                  transition={{ duration: 0.62, ease: 'easeOut' }}
                />
              ))}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {aliveText ? (
            <motion.span
              className="pointer-events-none absolute left-1/2 top-[-14px] z-20 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-emerald-600 dark:text-emerald-300"
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              Я оживаю!
            </motion.span>
          ) : null}
        </AnimatePresence>

        <Button className="h-12 w-full rounded-2xl" disabled={isWatering || running} onClick={handleWater}>
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
                Полив отмечен
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
                {isWatering || running ? 'Отмечаем полив...' : 'Полито'}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>
    </motion.section>
  );
}
