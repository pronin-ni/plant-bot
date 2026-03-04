import { useMutation } from '@tanstack/react-query';
import { Camera, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { identifyPlantOpenRouter } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import type { OpenRouterIdentifyResult } from '@/types/api';

import { Button } from '@/components/ui/button';

export function PlantPhotoCapture({
  onIdentified
}: {
  onIdentified: (result: OpenRouterIdentifyResult) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  const identifyMutation = useMutation({
    mutationFn: identifyPlantOpenRouter,
    onSuccess: (result) => {
      hapticNotify('success');
      onIdentified(result);
    },
    onError: () => hapticNotify('error')
  });

  async function onFile(file: File) {
    const dataUrl = await toDataUrl(file);
    setPreview(dataUrl);
    hapticImpact('light');
    identifyMutation.mutate(dataUrl);
  }

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-semibold">Определение растения по фото (AI)</p>
      </div>
      <p className="text-ios-caption text-ios-subtext">
        Фото отправляется на ваш backend, а затем в OpenRouter. Ключ API не попадает во фронтенд.
      </p>

      <div className="overflow-hidden rounded-ios-card border border-ios-border/60 bg-ios-card/60">
        {preview ? (
          <img src={preview} alt="Предпросмотр" className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-44 items-center justify-center text-ios-subtext">Выберите фото растения</div>
        )}
      </div>

      <label className="block">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onFile(file);
            }
          }}
        />
        <Button type="button" className="w-full">
          <Camera className="mr-2 h-4 w-4" />
          {identifyMutation.isPending ? 'Распознаём...' : 'Сфотографировать / выбрать'}
        </Button>
      </label>

      {identifyMutation.data ? (
        <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm dark:bg-zinc-900/40">
          <p className="font-semibold text-ios-text">{identifyMutation.data.russianName ?? 'Не удалось определить название'}</p>
          <p className="text-ios-caption text-ios-subtext">{identifyMutation.data.latinName ?? '—'}</p>
          <p className="mt-1 text-ios-caption text-ios-subtext">Уверенность: {identifyMutation.data.confidence}%</p>
          {identifyMutation.data.confidence < 60 ? (
            <p className="mt-2 text-[12px] text-amber-700">Низкая уверенность. Проверьте название вручную.</p>
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
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}
