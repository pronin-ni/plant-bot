import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { Flower2, Home, Leaf, Sprout } from 'lucide-react';

import { cn } from '@/lib/cn';

export type PlantCategoryFilter = 'ALL' | 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';

const TABS: Array<{
  key: PlantCategoryFilter;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: 'ALL', label: 'Все', icon: Leaf },
  { key: 'HOME', label: 'Дом', icon: Home },
  { key: 'OUTDOOR_DECORATIVE', label: 'Декор', icon: Flower2 },
  { key: 'OUTDOOR_GARDEN', label: 'Сад', icon: Sprout }
];

export function CategoryTabs({
  value,
  onChange,
  embedded = false
}: {
  value: PlantCategoryFilter;
  onChange: (next: PlantCategoryFilter) => void;
  embedded?: boolean;
}) {
  return (
    <motion.div
      className={embedded ? 'rounded-[20px] bg-[hsl(var(--background)/0.28)] p-1' : 'ios-blur-card rounded-[24px] p-1.5 shadow-[0_14px_34px_rgb(15_23_42/0.08)]'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
    >
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.key === value;
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'touch-target relative min-h-11 shrink-0 rounded-ios-button px-3 py-2.5 text-[13px] font-medium transition-colors',
                active ? 'text-ios-text' : 'text-ios-subtext'
              )}
            >
              {active ? (
                <motion.span
                  layoutId="plants-category-tab-indicator"
                  className="absolute inset-0 rounded-ios-button bg-[hsl(var(--card)/0.96)] shadow-[0_10px_22px_rgb(15_23_42/0.10)]"
                  transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
                />
              ) : null}
              <span className="relative inline-flex items-center justify-center gap-1">
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
