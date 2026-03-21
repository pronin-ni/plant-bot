import type { PlantDto } from '@/types/api';

export function SeedStageMeta({
  daysSinceSowing,
  expectedGerminationDaysMin,
  expectedGerminationDaysMax,
  recentActions
}: {
  daysSinceSowing: number | null;
  expectedGerminationDaysMin?: PlantDto['expectedGerminationDaysMin'];
  expectedGerminationDaysMax?: PlantDto['expectedGerminationDaysMax'];
  recentActions: string[];
}) {
  const windowLabel = expectedGerminationDaysMin != null && expectedGerminationDaysMax != null
    ? `${expectedGerminationDaysMin}-${expectedGerminationDaysMax} дн.`
    : 'ещё не рассчитано';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <MetaChip label="После посева" value={daysSinceSowing != null ? `${daysSinceSowing} дн.` : '—'} />
        <MetaChip label="Окно всходов" value={windowLabel} />
      </div>
      {recentActions.length ? (
        <div className="theme-surface-subtle rounded-2xl border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-subtext">Последние действия</p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-ios-text">
            {recentActions.slice(0, 2).map((item, index) => (
              <li key={`${item}-${index}`}>• {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-surface-subtle rounded-2xl border p-2.5">
      <p className="text-[11px] text-ios-subtext">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-ios-text">{value}</p>
    </div>
  );
}
