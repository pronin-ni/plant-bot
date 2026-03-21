import { Button } from '@/components/ui/button';
import type { SeedActionDescriptor } from '@/components/seed/seedStageUi';

export function SeedPrimaryAction({
  action,
  loading,
  onAction
}: {
  action: SeedActionDescriptor | null;
  loading: boolean;
  onAction: (key: SeedActionDescriptor['key']) => void;
}) {
  if (!action) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-ios-accent/20 bg-[hsl(var(--accent)/0.08)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-accent">Главный шаг сейчас</p>
      <Button
        type="button"
        className="mt-2 h-11 w-full rounded-2xl text-sm font-semibold shadow-[0_10px_24px_rgba(10,132,255,0.18)]"
        disabled={loading}
        onClick={() => onAction(action.key)}
      >
        {loading ? 'Сохраняем...' : action.label}
      </Button>
      {action.subtitle ? (
        <p className="mt-2 text-xs leading-5 text-ios-subtext">{action.subtitle}</p>
      ) : null}
    </div>
  );
}
