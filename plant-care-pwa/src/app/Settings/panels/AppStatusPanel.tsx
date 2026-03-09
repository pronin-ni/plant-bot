import { useEffect, useState } from 'react';

import { useAuthStore } from '@/lib/store';

import { APP_VERSION } from './panel-shared';
import { StatusLine } from './StatusLine';

export function AppStatusPanel() {
  const roles = useAuthStore((s) => s.roles);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="space-y-3 text-sm">
      <StatusLine label="Сеть" value={isOnline ? 'online' : 'offline'} />
      <StatusLine label="Service Worker" value={'serviceWorker' in navigator ? 'supported' : 'not supported'} />
      <StatusLine label="Push API" value={'PushManager' in window ? 'supported' : 'not supported'} />
      <StatusLine label="Версия" value={APP_VERSION} />
      <StatusLine label="Роли" value={roles.join(', ') || 'ROLE_USER'} />
    </div>
  );
}
