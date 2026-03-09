import { useMemo } from 'react';

import { StatusLine } from './StatusLine';

export function DiagnosticsPanel() {
  const checks = useMemo(() => {
    const storageOk = (() => {
      try {
        localStorage.setItem('__settings_diag', 'ok');
        localStorage.removeItem('__settings_diag');
        return true;
      } catch {
        return false;
      }
    })();

    return [
      { label: 'localStorage', ok: storageOk },
      { label: 'Notification API', ok: typeof Notification !== 'undefined' },
      { label: 'Service Worker', ok: 'serviceWorker' in navigator },
      { label: 'PushManager', ok: 'PushManager' in window }
    ];
  }, []);

  return (
    <div className="space-y-3">
      {checks.map((item) => (
        <StatusLine key={item.label} label={item.label} value={item.ok ? 'ok' : 'not available'} ok={item.ok} />
      ))}
    </div>
  );
}
