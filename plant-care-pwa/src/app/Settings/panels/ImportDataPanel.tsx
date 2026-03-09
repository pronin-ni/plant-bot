import { useState } from 'react';
import { CloudUpload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { importFromCloud } from '@/lib/api';
import { hapticImpact } from '@/lib/telegram';

export function ImportDataPanel() {
  const [pendingProvider, setPendingProvider] = useState<'drive' | 'dropbox' | null>(null);
  const [status, setStatus] = useState<string>('');

  const doImport = async (provider: 'drive' | 'dropbox') => {
    setPendingProvider(provider);
    try {
      const response = await importFromCloud(provider);
      setStatus(`Импорт завершён, записей: ${response.imported}`);
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось выполнить импорт.');
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Выберите источник. Импорт выполняется на сервере.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void doImport('drive')} disabled={pendingProvider !== null}>
          <CloudUpload className="mr-2 h-4 w-4" />
          {pendingProvider === 'drive' ? 'Импорт из Drive...' : 'Импорт из Drive'}
        </Button>
        <Button variant="secondary" onClick={() => void doImport('dropbox')} disabled={pendingProvider !== null}>
          <CloudUpload className="mr-2 h-4 w-4" />
          {pendingProvider === 'dropbox' ? 'Импорт из Dropbox...' : 'Импорт из Dropbox'}
        </Button>
      </div>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
