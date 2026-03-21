import { CloudOff, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { syncOfflineQueue } from '@/lib/api';
import { impactLight, impactMedium, impactHeavy } from '@/lib/haptics';
import { useOfflineStore } from '@/lib/store';

export function OfflineStatusBar() {
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingMutations = useOfflineStore((s) => s.pendingMutations);

  if (!isOffline && pendingMutations === 0) {
    return null;
  }

  return (
    <section className="ios-blur-card mb-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CloudOff className="h-4 w-4 shrink-0 text-ios-accent" />
          <p className="truncate text-[12px] text-ios-subtext">
            {isOffline
              ? `Нет сети. В очереди синхронизации: ${pendingMutations}`
              : `Ожидает синхронизации: ${pendingMutations}`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2 text-[11px]"
          onClick={() => {
            impactLight();
            void syncOfflineQueue();
          }}
        >
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          Синхронизировать
        </Button>
      </div>
    </section>
  );
}
