import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudFog, CloudRain, CloudSun, Droplets, Sun, ThermometerSun, TriangleAlert } from 'lucide-react';

import { getPlantConditions, getWeatherCurrent } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface ConditionsForecastProps {
  plantId?: number | null;
  plantName?: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function WeatherIcon({ code }: { code?: string | null }) {
  const icon = (code ?? '').toLowerCase();
  const cls = 'h-3.5 w-3.5 text-ios-accent';
  if (icon.includes('clear')) return <Sun className={cls} />;
  if (icon.includes('partly')) return <CloudSun className={cls} />;
  if (icon.includes('rain') || icon.includes('drizzle')) return <CloudRain className={cls} />;
  if (icon.includes('fog')) return <CloudFog className={cls} />;
  return <CloudSun className={cls} />;
}

function buildTip(input: { temp?: number; humidity?: number; adjustment?: number }, hasWeatherFallback: boolean): string {
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
  if (hasWeatherFallback) {
    return 'Подсказка на основе выбранного погодного провайдера. Подключите HA, чтобы учитывать комнатные датчики.';
  }
  return 'Укажите город и провайдера погоды в Настройках или подключите HA.';
}

export function ConditionsForecast({ plantId, plantName }: ConditionsForecastProps) {
  const authCity = useAuthStore((s) => s.city);
  const [weatherCity, setWeatherCity] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('settings:weather-city');
    const next = (stored ?? authCity ?? '').trim();
    setWeatherCity(next || null);
  }, [authCity]);

  const forecastQuery = useQuery({
    queryKey: ['calendar-conditions-forecast', plantId],
    queryFn: () => getPlantConditions(plantId as number),
    enabled: Boolean(plantId)
  });

  const weatherQuery = useQuery({
    queryKey: ['calendar-weather-current', weatherCity],
    queryFn: () => getWeatherCurrent(weatherCity as string),
    enabled: Boolean(weatherCity),
    staleTime: 10 * 60_000
  });

  const tip = useMemo(() => {
    return buildTip({
      temp: forecastQuery.data?.temperatureC,
      humidity: forecastQuery.data?.humidityPercent,
      adjustment: forecastQuery.data?.latestAdjustmentPercent
    }, Boolean(weatherQuery.data));
  }, [forecastQuery.data, weatherQuery.data]);

  const tempValue = isFiniteNumber(forecastQuery.data?.temperatureC)
    ? forecastQuery.data?.temperatureC
    : weatherQuery.data?.tempC;
  const humidityValue = isFiniteNumber(forecastQuery.data?.humidityPercent)
    ? forecastQuery.data?.humidityPercent
    : weatherQuery.data?.humidity;

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

      {forecastQuery.data || weatherQuery.data ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-ios-border/55 bg-white/50 p-2 text-xs dark:bg-zinc-900/50">
            <p className="inline-flex items-center gap-1 text-ios-subtext"><ThermometerSun className="h-3.5 w-3.5" />Температура</p>
            <p className="mt-1 text-sm font-semibold text-ios-text">
              {isFiniteNumber(tempValue) ? `${tempValue.toFixed(1)}°C` : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-ios-border/55 bg-white/50 p-2 text-xs dark:bg-zinc-900/50">
            <p className="inline-flex items-center gap-1 text-ios-subtext"><Droplets className="h-3.5 w-3.5" />Влажность</p>
            <p className="mt-1 text-sm font-semibold text-ios-text">
              {isFiniteNumber(humidityValue) ? `${humidityValue.toFixed(0)}%` : '—'}
            </p>
          </div>
        </div>
      ) : null}

      {weatherQuery.data ? (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-ios-border/50 bg-white/60 px-2 py-1 text-[11px] text-ios-subtext dark:bg-zinc-900/60">
          <WeatherIcon code={weatherQuery.data.icon} />
          <span>{weatherQuery.data.description ?? 'Погодный провайдер'}</span>
          <span className="text-ios-subtext/70">· {weatherQuery.data.city}</span>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-ios-subtext">{tip}</p>
    </section>
  );
}
