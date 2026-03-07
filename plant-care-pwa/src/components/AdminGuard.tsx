import { useEffect, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

import { useAuthStore, useUiStore } from '@/lib/store';

export function AdminGuard({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  useEffect(() => {
    if (!isAdmin) {
      setActiveTab('home');
    }
  }, [isAdmin, setActiveTab]);

  if (!isAdmin) {
    return (
      <div className="ios-blur-card p-4 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-red-500" />
        <p className="text-ios-body">Доступ к админ-панели ограничен.</p>
      </div>
    );
  }

  return <>{children}</>;
}

