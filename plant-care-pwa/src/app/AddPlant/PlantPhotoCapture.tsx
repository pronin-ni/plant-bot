import { useMutation } from '@tanstack/react-query';
import { Camera, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { identifyPlantOpenRouter } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import type { OpenRouterIdentifyResult } from '@/types/api';


export function PlantPhotoCapture({
  onIdentified
}: {
  onIdentified: (result: OpenRouterIdentifyResult) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  const identifyMutation = useMutation({
    mutationFn: identifyPlantOpenRouter,
    onSuccess: (result) => {
      hapticSuccess();
      onIdentified(result);
    },
    onError: () => hapticError()
  });

  async function onFile(file: File) {
    if (identifyMutation.isPending) {
      return;
    }
    const dataUrl = await toDataUrl(file);
    setPreview(dataUrl);
    impactLight();
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

      <input
        id="plant-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={identifyMutation.isPending}
        onChange={(event) => {
          if (identifyMutation.isPending) {
            return;
          }
          const file = event.target.files?.[0];
          if (file) {
            void onFile(file);
          }
        }}
      />
      <label htmlFor="plant-photo-input" className="block">
        <span
          className={`inline-flex h-12 w-full items-center justify-center rounded-ios-button bg-[hsl(var(--primary))] px-5 text-ios-body font-medium text-[hsl(var(--primary-foreground))] shadow-ios ${
            identifyMutation.isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
          }`}
        >
          <Camera className="mr-2 h-4 w-4" />
          {identifyMutation.isPending ? 'Распознаём...' : 'Сфотографировать / выбрать'}
        </span>
      </label>

      {identifyMutation.data ? (
        <div className="theme-surface-2 rounded-ios-button border p-3 text-sm">
          <p className="font-semibold text-ios-text">{identifyMutation.data.russianName ?? 'Не удалось определить название'}</p>
          <p className="text-ios-caption text-ios-subtext">{identifyMutation.data.latinName ?? '—'}</p>
          <p className="mt-1 text-ios-caption text-ios-subtext">Уверенность: {identifyMutation.data.confidence}%</p>
          {identifyMutation.data.confidence < 60 ? (
            <p className="theme-banner-warning mt-2 rounded-xl border px-3 py-2 text-[12px]">Низкая уверенность. Проверьте название вручную.</p>
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
