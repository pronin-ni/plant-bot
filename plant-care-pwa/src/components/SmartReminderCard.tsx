import { BellRing, Clock3, Droplets } from 'lucide-react';

import { parseDateOnly, startOfLocalDay } from '@/lib/date';
import { buildExplainabilityViewModel, getExplainabilityReminderLine } from '@/lib/explainability';
import type { PlantDto } from '@/types/api';

export function SmartReminderCard({ plant }: { plant: PlantDto }) {
  const nextDate = plant.nextWateringDate ? parseDateOnly(plant.nextWateringDate) : null;
  const today = startOfLocalDay(new Date());
  const daysLeft = nextDate ? Math.floor((startOfLocalDay(nextDate).getTime() - today.getTime()) / 86_400_000) : null;
  const explainability = buildExplainabilityViewModel({ plant });

  const context = getExplainabilityReminderLine(explainability, daysLeft);

  return (
    <div className="ios-blur-card p-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-semibold">Умное напоминание</p>
      </div>
      <p className="mt-1 text-sm text-ios-subtext">{plant.name}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          <p className="flex items-center gap-1 text-ios-subtext"><Clock3 className="h-3.5 w-3.5" /> Следующий полив</p>
          <p className="mt-1 font-semibold text-ios-text">
            {nextDate ? nextDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' }) : '—'}
          </p>
        </div>
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          <p className="flex items-center gap-1 text-ios-subtext"><Droplets className="h-3.5 w-3.5" /> Рекоменд. вода</p>
          <p className="mt-1 font-semibold text-ios-text">{plant.recommendedWaterMl ?? 0} мл</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ios-subtext">{context}</p>
    </div>
  );
}
