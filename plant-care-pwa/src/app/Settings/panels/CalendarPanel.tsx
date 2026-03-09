import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getCalendarSync, updateCalendarSync } from '@/lib/api';
import { hapticImpact } from '@/lib/telegram';
import type { CalendarSyncDto } from '@/types/api';

export function CalendarPanel() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [sync, setSync] = useState<CalendarSyncDto | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await getCalendarSync();
      setSync(response);
      setStatus(response.enabled ? 'Синхронизация включена.' : 'Синхронизация выключена.');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить состояние синхронизации.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleSync = async () => {
    if (!sync) {
      return;
    }
    setLoading(true);
    try {
      const response = await updateCalendarSync(!sync.enabled);
      setSync(response);
      setStatus(response.enabled ? 'Синхронизация включена.' : 'Синхронизация выключена.');
      hapticImpact('light');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось обновить настройку календаря.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ios-border/60 bg-white/70 p-4 text-xs text-ios-subtext dark:bg-zinc-900/50">
        <p>Статус: {sync?.enabled ? 'включено' : 'выключено'}</p>
        <p className="mt-1">URL: {sync?.httpsUrl ?? sync?.webcalUrl ?? '—'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={toggleSync} disabled={loading || !sync}>
          {sync?.enabled ? 'Отключить sync' : 'Включить sync'}
        </Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Обновить
        </Button>
      </div>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
