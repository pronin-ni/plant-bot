import { useState } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getPlants } from '@/lib/api';

interface ExportPayload {
  app: 'plant-bot-pwa';
  version: '1.0';
  exportedAt: string;
  plants: Awaited<ReturnType<typeof getPlants>>;
}

export function ExportDataPanel() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string>('');

  const doExport = async () => {
    setPending(true);
    try {
      const plants = await getPlants();
      const payload: ExportPayload = {
        app: 'plant-bot-pwa',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        plants
      };

      const fileName = `plant-bot-export-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setStatus(`Экспорт готов: ${fileName}. Растений: ${plants.length}.`);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сформировать экспорт JSON.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">
        Экспорт выгружает ваши растения в JSON-файл. Этот файл можно импортировать обратно.
      </p>
      <Button variant="secondary" onClick={doExport} disabled={pending}>
        <Download className="mr-2 h-4 w-4" />
        {pending ? 'Экспорт...' : 'Скачать экспорт'}
      </Button>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
