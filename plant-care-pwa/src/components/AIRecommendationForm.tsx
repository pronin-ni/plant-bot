import { useMemo } from 'react';
import { CalendarDays, Droplets, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PlantCategory } from '@/types/plant';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatRuDate(value: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(value);
}

export function AIRecommendationForm({
  category,
  aiIntervalDays,
  aiWaterVolumeMl,
  intervalDays,
  waterVolumeMl,
  onIntervalDaysChange,
  onWaterVolumeMlChange,
  light,
  soil,
  notes,
  source,
  manualMode,
  onManualModeChange,
  onApplyAi
}: {
  category: PlantCategory;
  aiIntervalDays: number | null;
  aiWaterVolumeMl: number | null;
  intervalDays: number;
  waterVolumeMl: number;
  onIntervalDaysChange: (value: number) => void;
  onWaterVolumeMlChange: (value: number) => void;
  light?: string | null;
  soil?: string | null;
  notes?: string | null;
  source?: string | null;
  manualMode: boolean;
  onManualModeChange: (value: boolean) => void;
  onApplyAi: () => void;
}) {
  const effectiveInterval = clamp(intervalDays, 1, 60);
  const effectiveVolume = clamp(waterVolumeMl, 50, 10_000);

  const previewDates = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 5 }, (_, index) => {
      const date = addDays(now, effectiveInterval * (index + 1));
      return {
        label: formatRuDate(date),
        // Простой визуальный вес для мини-графика.
        height: 24 + Math.min(30, Math.round((effectiveVolume / 1000) * 7))
      };
    });
  }, [effectiveInterval, effectiveVolume]);

  const helper = category === 'OUTDOOR_GARDEN'
    ? 'Для садовых можно увеличить объём в жару на 10-20%.'
    : 'Для домашних и декоративных лучше поливать чаще, но умеренно.';

  const greenhouseTip = category === 'OUTDOOR_GARDEN'
    ? 'AI-подсказка: для теплицы уменьшите полив на 20% при жаре и высокой влажности воздуха.'
    : null;

  return (
    <div className="theme-surface-1 space-y-3 rounded-ios-button border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ios-accent" />
          <p className="text-sm font-semibold">Рекомендации и ручная настройка</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={!manualMode ? 'default' : 'secondary'}
            size="sm"
            onClick={() => onManualModeChange(false)}
          >
            Согласен
          </Button>
          <Button
            variant={manualMode ? 'default' : 'secondary'}
            size="sm"
            onClick={() => onManualModeChange(true)}
          >
            Ручной ввод
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          <p className="text-ios-subtext">Свет</p>
          <p className="font-medium">{light || 'рассеянный'}</p>
        </div>
        <div className="theme-surface-subtle rounded-ios-button border p-2">
          <p className="text-ios-subtext">Почва</p>
          <p className="font-medium">{soil || 'универсальная'}</p>
        </div>
      </div>

      {notes ? <p className="text-xs text-ios-subtext">{notes}</p> : null}
      <p className="text-xs text-ios-subtext">{helper}</p>
      {greenhouseTip ? <p className="text-xs text-ios-subtext">{greenhouseTip}</p> : null}
      <p className="text-[11px] text-ios-subtext">Источник: {source || 'эвристика'}</p>

      {manualMode ? (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Интервал</span>
              <span>{effectiveInterval} дн.</span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              value={effectiveInterval}
              onChange={(e) => onIntervalDaysChange(clamp(Number(e.target.value) || 1, 1, 60))}
              className="h-2 w-full accent-[var(--ios-accent)]"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1"><Droplets className="h-3.5 w-3.5" /> Объём</span>
              <span>{effectiveVolume} мл</span>
            </div>
            <input
              type="range"
              min={50}
              max={10000}
              step={50}
              value={effectiveVolume}
              onChange={(e) => onWaterVolumeMlChange(clamp(Number(e.target.value) || 50, 50, 10_000))}
              className="h-2 w-full accent-[var(--ios-accent)]"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="theme-surface-subtle rounded-ios-button border px-3 py-2 text-xs">
            Интервал: <b>{effectiveInterval} дн.</b>
          </div>
          <div className="theme-surface-subtle rounded-ios-button border px-3 py-2 text-xs">
            Объём: <b>{effectiveVolume} мл</b>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            disabled={!aiIntervalDays && !aiWaterVolumeMl}
            onClick={onApplyAi}
          >
            Применить AI
          </Button>
        </div>
      )}

      <div className="theme-surface-subtle rounded-ios-button border p-2">
        <p className="mb-2 text-xs text-ios-subtext">Предпросмотр календаря поливов</p>
        <div className="flex items-end gap-2">
          {previewDates.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-md bg-ios-accent/35" style={{ height: `${item.height}px` }} />
              <span className="text-[11px] text-ios-subtext">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
