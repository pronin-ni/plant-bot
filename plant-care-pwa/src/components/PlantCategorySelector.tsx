import { motion } from 'framer-motion';
import { Flower2, Home, Sprout } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { PlantCategory } from '@/types/plant';

const CATEGORY_META: Record<PlantCategory, { title: string; subtitle: string; icon: typeof Home }> = {
  HOME: {
    title: 'Домашние',
    subtitle: 'Комната, квартира, офис',
    icon: Home
  },
  OUTDOOR_DECORATIVE: {
    title: 'Декоративные уличные',
    subtitle: 'Клумбы, террасы, декоративный сад',
    icon: Flower2
  },
  OUTDOOR_GARDEN: {
    title: 'Садовые',
    subtitle: 'Овощи, ягоды, плодовые',
    icon: Sprout
  },
  SEED_START: {
    title: 'Проращивание семян',
    subtitle: 'Посев, всходы, сеянцы',
    icon: Sprout
  }
};

export function PlantCategorySelector({
  value,
  onChange
}: {
  value: PlantCategory;
  onChange: (category: PlantCategory) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {(Object.keys(CATEGORY_META) as PlantCategory[]).map((category) => {
        const meta = CATEGORY_META[category];
        const Icon = meta.icon;
        const active = value === category;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={cn(
              'relative overflow-hidden rounded-ios-card border p-4 text-left transition-all',
              active
                ? 'theme-pill-active shadow-ios'
                : 'theme-surface-2 hover:border-ios-accent/35'
            )}
          >
            {active ? (
              <motion.span
                layoutId="category-active-pill"
                className="absolute inset-0 bg-gradient-to-br from-ios-accent/12 via-transparent to-transparent"
                transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
              />
            ) : null}

            <div className="relative flex items-center gap-3">
              <div className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border',
                active ? 'border-ios-accent/30 bg-ios-accent/15 text-ios-accent' : 'border-ios-border/60 text-ios-subtext'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-ios-body font-semibold text-ios-text">{meta.title}</p>
                <p className="text-ios-caption text-ios-subtext">{meta.subtitle}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
