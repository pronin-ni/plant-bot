import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createAdminBackup, getAdminBackups, restoreAdminBackup } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { hapticImpact } from '@/lib/telegram';
import type { AdminBackupItemDto } from '@/types/api';

export function BackupsPanel() {
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [pending, setPending] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [restorePending, setRestorePending] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [latestBackups, setLatestBackups] = useState<AdminBackupItemDto[]>([]);

  const loadBackups = async () => {
    if (!isAdmin) {
      return;
    }
    setLoadingList(true);
    try {
      const items = await getAdminBackups();
      const sorted = [...items].sort((a, b) => b.modifiedAtEpochMs - a.modifiedAtEpochMs).slice(0, 3);
      setLatestBackups(sorted);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить список бэкапов.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadBackups();
  }, [isAdmin]);

  const backup = async () => {
    if (!isAdmin) {
      setStatus('Серверные бэкапы доступны только администратору.');
      return;
    }

    setPending(true);
    try {
      const response = await createAdminBackup();
      setStatus(response.fileName ? `Бэкап создан: ${response.fileName}` : 'Бэкап создан.');
      hapticImpact('medium');
      await loadBackups();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось создать серверный бэкап.');
    } finally {
      setPending(false);
    }
  };

  const restore = async (fileName: string) => {
    if (!isAdmin) {
      return;
    }
    const confirmed = window.confirm(`Восстановить базу из бэкапа ${fileName}? Текущее состояние будет перезаписано.`);
    if (!confirmed) {
      return;
    }
    setRestorePending(fileName);
    setStatus('Восстанавливаем бэкап...');
    try {
      const res = await restoreAdminBackup(fileName);
      setStatus(res.message || `Бэкап ${fileName} восстановлен.`);
      hapticImpact('medium');
      await loadBackups();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось восстановить бэкап.');
    } finally {
      setRestorePending(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-ios-subtext">
          Серверные бэкапы доступны только администратору. Для себя используйте «Экспорт данных» в JSON.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Серверный бэкап базы данных (только для администратора).</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={backup} disabled={pending}>
          <Database className="mr-2 h-4 w-4" />
          {pending ? 'Создаём бэкап...' : 'Создать бэкап'}
        </Button>
        <Button variant="ghost" onClick={() => void loadBackups()} disabled={loadingList || pending}>
          {loadingList ? 'Обновляем...' : 'Обновить список'}
        </Button>
      </div>

      {latestBackups.length > 0 ? (
        <ul className="space-y-1 text-xs text-ios-subtext">
          {latestBackups.map((item) => (
            <li key={item.fileName} className="rounded-lg border border-ios-border/50 bg-white/60 px-3 py-2 dark:bg-zinc-900/50">
              <span className="block truncate text-ios-text">{item.fileName}</span>
              <span>
                {Math.max(1, Math.round(item.sizeBytes / 1024))} KB · {new Date(item.modifiedAtEpochMs).toLocaleString('ru-RU')}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void restore(item.fileName)}
                  disabled={pending || loadingList || restorePending === item.fileName}
                >
                  {restorePending === item.fileName ? 'Восстанавливаем...' : 'Восстановить'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
