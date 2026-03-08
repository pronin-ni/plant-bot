import { motion } from 'framer-motion';
import { Award, Camera, Droplets, Sparkles, Sprout, Sun, Trees } from 'lucide-react';

import type { AchievementItem } from '@/types/api';

const iconMap = {
  Sprout,
  Trees,
  Droplets,
  Droplet: Droplets,
  Sun,
  Camera,
  Sparkles
} as const;

export function AchievementCard({ item }: { item: AchievementItem }) {
  const Icon = iconMap[item.icon as keyof typeof iconMap] ?? Award;
  const pct = Math.round((item.progress / Math.max(1, item.target)) * 100);
  const progressWidth = Math.max(4, Math.min(100, pct));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={[
        'rounded-ios-button border p-3',
        item.unlocked
          ? 'border-emerald-400/40 bg-emerald-500/10'
          : 'border-ios-border/60 bg-white/60 dark:border-emerald-500/20 dark:bg-zinc-900/40'
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-ios-accent dark:bg-zinc-900/60">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ios-text">{item.title}</p>
            <p className="text-xs text-ios-subtext">{item.description}</p>
          </div>
        </div>
        <p className="text-xs text-ios-subtext">
          {item.progress}/{item.target}
        </p>
      </div>

      <div className="mt-2 h-2 rounded-full bg-black/10 dark:bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressWidth}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-lime-500"
        />
      </div>
    </motion.div>
  );
}
