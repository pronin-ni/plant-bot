import { Button } from '@/components/ui/button';
import type { SeedActionDescriptor } from '@/components/seed/seedStageUi';

export function SeedSecondaryActions({
  actions,
  loading,
  onAction
}: {
  actions: SeedActionDescriptor[];
  loading: boolean;
  onAction: (key: SeedActionDescriptor['key']) => void;
}) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ios-subtext">Можно сделать дополнительно</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="secondary"
            className="h-8.5 rounded-full border-ios-border/70 bg-transparent px-2.5 text-[11px] font-medium text-ios-subtext shadow-none"
            disabled={loading}
            onClick={() => onAction(action.key)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
