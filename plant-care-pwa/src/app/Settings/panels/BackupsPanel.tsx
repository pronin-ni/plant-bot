import { useState } from 'react';
import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { backupToTelegram } from '@/lib/api';
import { hapticImpact } from '@/lib/telegram';

export function BackupsPanel() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string>('');

  const backup = async () => {
    setPending(true);
    try {
      const response = await backupToTelegram();
      if (response.ok) {
        setStatus(response.file ? `Бэкап создан: ${response.file}` : 'Бэкап создан.');
        hapticImpact('medium');
      } else {
        setStatus('Сервер отклонил создание бэкапа.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось создать бэкап.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Бэкап отправляется через серверную команду Telegram-бота.</p>
      <Button variant="secondary" onClick={backup} disabled={pending}>
        <Database className="mr-2 h-4 w-4" />
        {pending ? 'Создаём бэкап...' : 'Создать бэкап'}
      </Button>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
