import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudSun, Droplets, ThermometerSun, TriangleAlert } from 'lucide-react';

import { getPlantConditions } from '@/lib/api';

interface ConditionsForecastProps {
  plantId?: number | null;
  plantName?: string;
}

function buildTip(input: { temp?: number; humidity?: number; adjustment?: number }): string {
  const { temp, humidity, adjustment } = input;

  if (typeof adjustment === 'number' && adjustment > 0.01) {
    return `Автокоррекция уже повышала полив на ${Math.round(adjustment * 100)}%.`;
  }
  if (typeof temp === 'number' && temp >= 28) {
    return `Ожидается жара ~${temp.toFixed(0)}°C — увеличьте объём полива примерно на 20%.`;
  }
  if (typeof humidity === 'number' && humidity <= 35) {
    return `Низкая влажность (${humidity.toFixed(0)}%) — стоит поливать чаще.`;
  }
  if (typeof humidity === 'number' && humidity >= 70) {
    return `Влажность повышенная (${humidity.toFixed(0)}%) — не переливайте и проветривайте.`;
  }
  if (typeof temp === 'number') {
    return `Температура около ${temp.toFixed(0)}°C — придерживайтесь базового графика полива.`;
  }
  return 'Подключите HA/датчики, чтобы получить персональный прогноз по условиям.';
}

export function ConditionsForecast({ plantId, plantName }: ConditionsForecastProps) {
  const forecastQuery = useQuery({
    queryKey: ['calendar-conditions-forecast', plantId],
    queryFn: () => getPlantConditions(plantId as number),
    enabled: Boolean(plantId)
  });

  const tip = useMemo(() => {
    if (!forecastQuery.data) {
      return 'Подключите Home Assistant, чтобы видеть прогноз полива на основе условий.';
    }

    return buildTip({
      temp: forecastQuery.data.temperatureC,
      humidity: forecastQuery.data.humidityPercent,
      adjustment: forecastQuery.data.latestAdjustmentPercent
    });
  }, [forecastQuery.data]);

  return (
    <section className="ios-blur-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-ios-body font-semibold">
          <CloudSun className="h-4 w-4 text-ios-accent" />
          Прогноз условий
        </p>
        {plantName ? <span className="text-[11px] text-ios-subtext">{plantName}</span> : null}
      </div>

      {forecastQuery.isLoading ? (
        <p className="text-sm text-ios-subtext">Получаем данные по температуре и влажности...</p>
      ) : null}

      {forecastQuery.isError ? (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <p className="inline-flex items-center gap-1.5"><TriangleAlert className="h-4 w-4" />Не удалось получить условия. Проверьте подключение HA.</p>
        </div>
      ) : null}

      {forecastQuery.data ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-ios-border/55 bg-white/50 p-2 text-xs dark:bg-zinc-900/50">
            <p className="inline-flex items-center gap-1 text-ios-subtext"><ThermometerSun className="h-3.5 w-3.5" />Температура</p>
            <p className="mt-1 text-sm font-semibold text-ios-text">
              {typeof forecastQuery.data.temperatureC === 'number' ? `${forecastQuery.data.temperatureC.toFixed(1)}°C` : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-ios-border/55 bg-white/50 p-2 text-xs dark:bg-zinc-900/50">
            <p className="inline-flex items-center gap-1 text-ios-subtext"><Droplets className="h-3.5 w-3.5" />Влажность</p>
            <p className="mt-1 text-sm font-semibold text-ios-text">
              {typeof forecastQuery.data.humidityPercent === 'number' ? `${forecastQuery.data.humidityPercent.toFixed(0)}%` : '—'}
            </p>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-ios-subtext">{tip}</p>
    </section>
  );
}
