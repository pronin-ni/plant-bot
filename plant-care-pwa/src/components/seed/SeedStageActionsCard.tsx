import { ArrowRight, Clock3, Droplets, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  deriveSeedStagePresentation,
  getSeedProgressItems,
  seedDaysSinceSowing,
  type SeedActionKey,
  type SeedStage
} from '@/components/seed/seedStageUi';
import { cn } from '@/lib/cn';
import type { PlantDto } from '@/types/api';

export function SeedStageActionsCard({
  plant,
  loading,
  onAction,
  onStageChange,
  onMigrate,
  migrationAllowed
}: {
  plant: PlantDto;
  loading: boolean;
  onAction: (action: Exclude<SeedActionKey, 'MIGRATE'>) => void;
  onStageChange?: (stage: SeedStage) => void;
  onMigrate?: () => void;
  migrationAllowed: boolean;
}) {
  const presentation = deriveSeedStagePresentation(plant, { canMigrate: migrationAllowed && Boolean(onMigrate) });
  const daysSinceSowing = seedDaysSinceSowing(plant);
  const progressItems = getSeedProgressItems(plant.seedStage);
  const facts = buildSeedFacts(plant, daysSinceSowing);

  const handleAction = (key: SeedActionKey) => {
    if (key === 'MIGRATE') {
      onMigrate?.();
      return;
    }
    onAction(key);
  };

  return (
    <section className="theme-surface-1 overflow-hidden rounded-[30px] border shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur-ios">
      <div className="border-b border-ios-border/50 bg-[linear-gradient(180deg,rgba(10,132,255,0.06),transparent)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ios-subtext">Текущая стадия</p>
            <h3 className="mt-1 text-[1.18rem] font-semibold tracking-[-0.03em] text-ios-text">{presentation.title}</h3>
            <p className="mt-1 text-sm leading-6 text-ios-subtext">{presentation.statusLine}</p>
          </div>
          {onStageChange ? (
            <select
              value={presentation.stage}
              disabled={loading}
              onChange={(event) => onStageChange(event.target.value as SeedStage)}
              className="theme-field min-h-10 rounded-full border px-3 text-xs font-medium"
              aria-label="Сменить стадию"
            >
              <option value="SOWN">Посеяно</option>
              <option value="GERMINATING">Прорастание</option>
              <option value="SPROUTED">Всходы</option>
              <option value="SEEDLING">Сеянец</option>
              <option value="READY_TO_TRANSPLANT">К пересадке</option>
            </select>
          ) : null}
        </div>

        <div className="mt-4 rounded-[24px] border border-ios-border/60 bg-white/70 p-3 dark:bg-ios-card/70">
          <div className="flex items-center justify-between gap-2">
            {progressItems.map((item, index) => {
              const active = item.state === 'current';
              const done = item.state === 'done';
              return (
                <div key={item.key} className="flex min-w-0 flex-1 items-center gap-2">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                      active && 'border-transparent bg-ios-accent text-white shadow-[0_0_0_4px_rgba(10,132,255,0.12)]',
                      done && 'border-emerald-400/35 bg-emerald-500/90 text-white',
                      !active && !done && 'border-ios-border/70 bg-ios-card text-ios-subtext'
                    )}
                  >
                    {done ? '✓' : index + 1}
                  </div>
                  {index < progressItems.length - 1 ? (
                    <div className="h-px flex-1 bg-ios-border/60" />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {progressItems.map((item) => (
              <span
                key={item.key}
                className={cn(
                  'text-[10px] leading-4',
                  item.state === 'current' && 'font-semibold text-ios-text',
                  item.state === 'done' && 'text-ios-text/85',
                  item.state === 'upcoming' && 'text-ios-subtext'
                )}
              >
                {item.shortLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-[26px] border border-ios-accent/15 bg-[linear-gradient(180deg,rgba(10,132,255,0.10),rgba(10,132,255,0.04))] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/85 text-ios-accent shadow-sm dark:bg-ios-card/90">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ios-accent">Главный шаг</p>
              <p className="mt-1 text-sm leading-6 text-ios-text">{presentation.summary}</p>
            </div>
          </div>

          {presentation.primaryAction ? (
            <>
              <Button
                type="button"
                className="mt-4 h-12 w-full justify-between rounded-[22px] px-4 text-left text-sm font-semibold shadow-[0_14px_28px_rgba(10,132,255,0.22)]"
                disabled={loading}
                onClick={() => handleAction(presentation.primaryAction!.key)}
              >
                <span>{loading ? 'Сохраняем...' : presentation.primaryAction.label}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              {presentation.primaryAction.subtitle ? (
                <p className="mt-2 text-xs leading-5 text-ios-subtext">{presentation.primaryAction.subtitle}</p>
              ) : null}
            </>
          ) : null}
        </div>

        {presentation.secondaryActions.length ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-subtext">Если нужно дополнительно</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {presentation.secondaryActions.map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 justify-start rounded-[20px] px-4 text-sm"
                  disabled={loading}
                  onClick={() => handleAction(action.key)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="theme-surface-subtle rounded-[22px] border p-3">
              <div className="flex items-center gap-2 text-ios-subtext">
                <fact.icon className="h-3.5 w-3.5" />
                <p className="text-[11px] uppercase tracking-[0.12em]">{fact.label}</p>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-5 text-ios-text">{fact.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildSeedFacts(plant: PlantDto, daysSinceSowing: number | null) {
  const germinationWindow = plant.expectedGerminationDaysMin != null && plant.expectedGerminationDaysMax != null
    ? `${plant.expectedGerminationDaysMin}-${plant.expectedGerminationDaysMax} дн.`
    : 'Пока без окна';
  const checkInterval = plant.recommendedCheckIntervalHours
    ? `Проверка каждые ${plant.recommendedCheckIntervalHours} ч`
    : 'Проверка по состоянию';

  return [
    {
      label: 'После посева',
      value: daysSinceSowing == null ? 'Дата не указана' : `${daysSinceSowing} дн.`,
      icon: Clock3
    },
    {
      label: 'Окно всходов',
      value: germinationWindow,
      icon: Droplets
    },
    {
      label: 'Контроль',
      value: checkInterval,
      icon: Sparkles
    }
  ];
}
