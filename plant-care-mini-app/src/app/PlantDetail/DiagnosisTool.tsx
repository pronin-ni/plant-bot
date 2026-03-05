import { Stethoscope } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { diagnosePlantOpenRouter } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';

export function DiagnosisTool({ plantName }: { plantName: string }) {
  const [preview, setPreview] = useState<string | null>(null);

  const diagnoseMutation = useMutation({
    mutationFn: (imageBase64: string) => diagnosePlantOpenRouter(imageBase64, plantName),
    onSuccess: () => hapticNotify('success'),
    onError: () => hapticNotify('error')
  });

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-semibold">AI-диагностика листьев</p>
      </div>

      <div className="overflow-hidden rounded-ios-card border border-ios-border/60 bg-ios-card/60">
        {preview ? (
          <img src={preview} alt="Лист" className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-44 items-center justify-center text-ios-subtext">Загрузите фото листа</div>
        )}
      </div>

      <input
        id="diagnosis-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          hapticImpact('light');
          void toDataUrl(file).then((dataUrl) => {
            setPreview(dataUrl);
            diagnoseMutation.mutate(dataUrl);
          });
        }}
      />
      <label htmlFor="diagnosis-photo-input" className="block">
        <span className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-ios-button border border-ios-border/70 bg-white/60 px-5 text-ios-body font-medium dark:bg-zinc-900/50">
          {diagnoseMutation.isPending ? 'Диагностируем...' : 'Проверить лист'}
        </span>
      </label>


      {diagnoseMutation.isError ? (
        <p className="text-[12px] text-red-500">Не удалось выполнить диагностику. Проверьте ключ OpenRouter, модель и лимиты.</p>
      ) : null}

      {diagnoseMutation.data ? (
        <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm dark:bg-zinc-900/40">
          <p className="font-semibold">{diagnoseMutation.data.problem ?? 'Проблема не определена'}</p>
          <p className="text-ios-caption text-ios-subtext">Уверенность: {diagnoseMutation.data.confidence}%</p>
          {diagnoseMutation.data.description ? <p className="mt-2">{diagnoseMutation.data.description}</p> : null}
          {diagnoseMutation.data.treatment ? <p className="mt-2"><b>Лечение:</b> {diagnoseMutation.data.treatment}</p> : null}
          {diagnoseMutation.data.prevention ? <p className="mt-1"><b>Профилактика:</b> {diagnoseMutation.data.prevention}</p> : null}
          <p className="mt-2 text-xs">Срочность: {diagnoseMutation.data.urgency}</p>
          {diagnoseMutation.data.confidence < 60 ? (
            <p className="mt-2 text-[12px] text-amber-700">Низкая уверенность. Проверьте условия и фото вручную.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}
