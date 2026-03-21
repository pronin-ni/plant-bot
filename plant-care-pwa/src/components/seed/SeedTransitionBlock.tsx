import { Sprout } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { targetEnvironmentLabel } from '@/components/seed/seedStageUi';
import type { PlantDto } from '@/types/api';

export function SeedTransitionBlock({
  plant,
  loading,
  disabled,
  onMigrate
}: {
  plant: PlantDto;
  loading: boolean;
  disabled: boolean;
  onMigrate?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-[linear-gradient(180deg,rgba(52,199,89,0.10),rgba(52,199,89,0.04))] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Следующий этап</p>
      <div className="flex items-start gap-3">
        <div className="theme-badge-success mt-2 rounded-2xl p-2">
          <Sprout className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="mt-2 text-sm font-semibold text-ios-text">Пора перейти к обычному растению</p>
          <p className="mt-1 text-sm leading-5 text-ios-text">
            Seed-этап почти завершён. Дальше начнётся обычный уход без режима проращивания.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-ios-subtext">
            Целевая категория: {targetEnvironmentLabel(plant.targetEnvironmentType)}.
            Мы сохраним текущий контекст и откроем короткий мастер перевода.
          </p>
        </div>
      </div>

      <Button
        type="button"
        className="mt-3 h-11 w-full rounded-2xl text-sm font-semibold shadow-[0_10px_24px_rgba(52,199,89,0.16)]"
        disabled={disabled || loading || !onMigrate}
        onClick={() => onMigrate?.()}
      >
        {loading ? 'Готовим перевод...' : 'Перевести в растение'}
      </Button>
    </div>
  );
}
