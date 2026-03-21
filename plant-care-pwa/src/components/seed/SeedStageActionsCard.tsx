import { SeedPrimaryAction } from '@/components/seed/SeedPrimaryAction';
import { SeedSecondaryActions } from '@/components/seed/SeedSecondaryActions';
import { SeedStageHeader } from '@/components/seed/SeedStageHeader';
import { SeedStageMeta } from '@/components/seed/SeedStageMeta';
import { SeedStageSwitcher } from '@/components/seed/SeedStageSwitcher';
import { SeedTransitionBlock } from '@/components/seed/SeedTransitionBlock';
import { deriveSeedStagePresentation, getSeedStageCopy, seedDaysSinceSowing, type SeedActionKey, type SeedStage } from '@/components/seed/seedStageUi';
import type { PlantDto } from '@/types/api';

export function SeedStageActionsCard({
  plant,
  loading,
  onAction,
  onStageChange,
  onMigrate,
  migrationAllowed,
  recentActions
}: {
  plant: PlantDto;
  loading: boolean;
  onAction: (action: Exclude<SeedActionKey, 'MIGRATE'>) => void;
  onStageChange?: (stage: SeedStage) => void;
  onMigrate?: () => void;
  migrationAllowed: boolean;
  recentActions: string[];
}) {
  const presentation = deriveSeedStagePresentation(plant, { canMigrate: migrationAllowed && Boolean(onMigrate) });
  const copy = getSeedStageCopy(plant.seedStage);
  const daysSinceSowing = seedDaysSinceSowing(plant);
  const showTransitionBlock = presentation.stage === 'READY_TO_TRANSPLANT';

  const handleAction = (key: SeedActionKey) => {
    if (key === 'MIGRATE') {
      onMigrate?.();
      return;
    }
    onAction(key);
  };

  return (
    <section className="theme-surface-1 space-y-3 rounded-3xl border p-3.5 shadow-sm backdrop-blur-ios">
      <SeedStageHeader
        stage={presentation.stage}
        title={copy.title}
        progressLabel={copy.progressLabel}
      />

      <div className="theme-surface-subtle rounded-2xl border p-3">
        <p className="text-sm leading-5 text-ios-text">{copy.summary}</p>
        {copy.helperCopy ? (
          <p className="mt-1.5 text-xs leading-5 text-ios-subtext">{copy.helperCopy}</p>
        ) : null}
      </div>

      <SeedStageSwitcher stage={presentation.stage} loading={loading} onStageChange={onStageChange} />
      {showTransitionBlock ? (
        <SeedTransitionBlock
          plant={plant}
          loading={loading}
          disabled={!migrationAllowed}
          onMigrate={onMigrate}
        />
      ) : (
        <SeedPrimaryAction action={presentation.primaryAction} loading={loading} onAction={handleAction} />
      )}
      <SeedSecondaryActions actions={presentation.secondaryActions} loading={loading} onAction={handleAction} />
      <SeedStageMeta
        daysSinceSowing={daysSinceSowing}
        expectedGerminationDaysMin={plant.expectedGerminationDaysMin}
        expectedGerminationDaysMax={plant.expectedGerminationDaysMax}
        recentActions={recentActions}
      />
    </section>
  );
}
