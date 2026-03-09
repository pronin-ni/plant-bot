import { useState } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { exportPdf } from '@/lib/api';

export function ExportDataPanel() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string>('');

  const doExport = async () => {
    setPending(true);
    try {
      const blob = await exportPdf();
      const link = document.createElement('a');
      const fileName = `plant-bot-export-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus(`Экспорт готов: ${fileName}`);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сформировать экспорт.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Экспорт выгружает актуальные данные в PDF.</p>
      <Button variant="secondary" onClick={doExport} disabled={pending}>
        <Download className="mr-2 h-4 w-4" />
        {pending ? 'Экспорт...' : 'Скачать экспорт'}
      </Button>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
