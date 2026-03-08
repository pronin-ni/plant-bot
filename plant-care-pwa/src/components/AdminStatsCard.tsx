import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useMotionGuard } from '@/lib/motion';

interface AdminStatsCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'default';
}

function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const from = value;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

function toneClass(tone: AdminStatsCardProps['tone']): string {
  if (tone === 'emerald') return 'text-emerald-700 dark:text-emerald-300';
  if (tone === 'blue') return 'text-sky-700 dark:text-sky-300';
  if (tone === 'amber') return 'text-amber-700 dark:text-amber-300';
  if (tone === 'red') return 'text-red-700 dark:text-red-300';
  return 'text-ios-text';
}

export function AdminStatsCard({ title, value, subtitle, icon: Icon, tone = 'default' }: AdminStatsCardProps) {
  const { canAnimate } = useMotionGuard();
  const animatedValue = useCountUp(value);

  return (
    <motion.article
      className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/60"
      initial={canAnimate ? { opacity: 0, y: 8 } : false}
      animate={canAnimate ? { opacity: 1, y: 0 } : {}}
      transition={canAnimate ? { type: 'spring', stiffness: 320, damping: 28 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ios-subtext">{title}</p>
        <Icon className={`h-4 w-4 ${toneClass(tone)}`} />
      </div>
      <p className={`mt-2 text-2xl font-semibold ${toneClass(tone)}`}>{canAnimate ? animatedValue : value}</p>
      <p className="mt-1 text-[12px] text-ios-subtext">{subtitle ?? 'Обновляется при pull-to-refresh'}</p>
    </motion.article>
  );
}
