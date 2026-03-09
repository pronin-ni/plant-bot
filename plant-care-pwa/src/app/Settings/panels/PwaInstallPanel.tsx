import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { trackMigrationEvent } from '@/lib/analytics';
import { getConfiguredPwaUrl, openPwaMigrationFlow } from '@/lib/pwa-migration';

export function PwaInstallPanel() {
  const [status, setStatus] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const pwaUrl = getConfiguredPwaUrl();

  const checkInstalled = () => {
    setChecking(true);
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
    setStatus(standalone || iosStandalone ? 'PWA уже установлено.' : 'PWA пока не установлено.');
    setChecking(false);
  };

  useEffect(() => {
    checkInstalled();
  }, []);

  const openInstallFlow = async () => {
    try {
      await openPwaMigrationFlow();
      trackMigrationEvent({ type: 'migration_started' });
      setStatus('Открываем поток установки PWA...');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось открыть поток установки.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ios-border/60 bg-white/70 p-4 text-xs text-ios-subtext dark:bg-zinc-900/50">
        <p>{status}</p>
        <p className="mt-1 break-all">URL: {pwaUrl || 'VITE_PWA_URL не задан'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={openInstallFlow} disabled={!pwaUrl}>
          Открыть установку
        </Button>
        <Button variant="ghost" onClick={checkInstalled} disabled={checking}>
          Проверить статус
        </Button>
      </div>
    </div>
  );
}
