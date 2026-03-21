import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export function PwaInstallPanel() {
  const [status, setStatus] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [opening, setOpening] = useState(false);
  const pwaUrl = typeof window !== 'undefined' ? `${window.location.origin}/pwa/` : '';

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
    if (opening) {
      return;
    }
    setOpening(true);
    try {
      window.open(pwaUrl, '_blank', 'noopener,noreferrer');
      setStatus('Открываем PWA в новой вкладке.');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось открыть поток установки.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="theme-surface-1 rounded-xl border p-4 text-xs text-ios-subtext">
        <p>{status}</p>
        <p className="mt-1 break-all">URL: {pwaUrl || 'VITE_PWA_URL не задан'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={openInstallFlow} disabled={!pwaUrl || opening}>
          {opening ? 'Открываем...' : 'Открыть установку'}
        </Button>
        <Button variant="ghost" onClick={checkInstalled} disabled={checking || opening}>
          {checking ? 'Проверяем...' : 'Проверить статус'}
        </Button>
      </div>
    </div>
  );
}
