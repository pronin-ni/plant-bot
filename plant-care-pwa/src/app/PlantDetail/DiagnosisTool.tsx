import { Stethoscope } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { diagnosePlantOpenRouter } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import type { PlantDto } from '@/types/api';

export function DiagnosisTool({ plant }: { plant: PlantDto }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const diagnoseMutation = useMutation({
    mutationFn: (imageBase64: string) =>
      diagnosePlantOpenRouter(
        imageBase64,
        plant.name,
        `Тип=${plant.type ?? 'DEFAULT'}; Размещение=${plant.placement}; Интервал=${plant.baseIntervalDays ?? 7}; Последний полив=${plant.lastWateredDate}`
      ),
    onSuccess: () => hapticSuccess(),
    onError: () => hapticError()
  });
  const diagnosisError =
    diagnoseMutation.isError && diagnoseMutation.error instanceof Error
      ? diagnoseMutation.error.message
      : 'Не удалось выполнить диагностику. Попробуйте ещё раз позже.';

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
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          impactLight();
          void toDataUrl(file).then((dataUrl) => {
            setPreview(dataUrl);
            diagnoseMutation.mutate(dataUrl);
          });
          event.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        className="theme-surface-subtle inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-ios-button border px-5 text-ios-body font-medium"
        onClick={() => inputRef.current?.click()}
      >
        {diagnoseMutation.isPending ? 'Диагностируем...' : 'Проверить лист'}
      </button>


      {diagnoseMutation.isError ? (
        <p className="theme-banner-danger rounded-xl border px-3 py-2 text-[12px]">{diagnosisError}</p>
      ) : null}

      {diagnoseMutation.data ? (
        <div className="theme-surface-2 rounded-ios-button border p-3 text-sm">
          <p className="font-semibold">{diagnoseMutation.data.problem ?? 'Проблема не определена'}</p>
          <p className="text-ios-caption text-ios-subtext">Уверенность: {diagnoseMutation.data.confidence}%</p>
          {diagnoseMutation.data.description ? <p className="mt-2">{diagnoseMutation.data.description}</p> : null}
          {diagnoseMutation.data.treatment ? <p className="mt-2"><b>Лечение:</b> {diagnoseMutation.data.treatment}</p> : null}
          {diagnoseMutation.data.prevention ? <p className="mt-1"><b>Профилактика:</b> {diagnoseMutation.data.prevention}</p> : null}
          <p className="mt-2 text-xs">Срочность: {diagnoseMutation.data.urgency}</p>
          {diagnoseMutation.data.confidence < 60 ? (
            <p className="theme-banner-warning mt-2 rounded-xl border px-3 py-2 text-[12px]">Низкая уверенность. Проверьте условия и фото вручную.</p>
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
