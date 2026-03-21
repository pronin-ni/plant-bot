import { SEED_STAGE_OPTIONS, type SeedStage } from '@/components/seed/seedStageUi';

export function SeedStageSwitcher({
  stage,
  loading,
  onStageChange
}: {
  stage: SeedStage;
  loading: boolean;
  onStageChange?: (stage: SeedStage) => void;
}) {
  if (!onStageChange) {
    return null;
  }

  return (
    <div className="theme-surface-subtle rounded-2xl border p-3">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-subtext">
        Сменить стадию
      </label>
      <select
        value={stage}
        disabled={loading}
        onChange={(event) => onStageChange(event.target.value as SeedStage)}
        className="theme-field mt-2 h-10 w-full rounded-xl border px-3 text-sm"
      >
        {SEED_STAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
