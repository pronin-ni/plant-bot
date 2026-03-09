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
  onChange
}: {
  value: PlantCategoryFilter;
  onChange: (next: PlantCategoryFilter) => void;
}) {
  return (
    <div className="ios-blur-card p-1.5">
      <div className="grid grid-cols-4 gap-1">
        {TABS.map((tab) => {
          const active = tab.key === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                'touch-target relative min-h-11 rounded-ios-button px-2 py-2.5 text-[13px] font-medium transition-colors',
                active ? 'text-ios-text' : 'text-ios-subtext'
              )}
            >
              {active ? (
                <motion.span
                  layoutId="plants-category-tab-indicator"
                  className="absolute inset-0 rounded-ios-button bg-white/80 shadow-ios dark:bg-zinc-900/75"
                  transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
                />
              ) : null}
              <span className="relative inline-flex items-center justify-center gap-1">
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
