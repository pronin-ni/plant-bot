import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Cloud, CloudFog, CloudRain, CloudSun, Droplets, Snowflake, Sun, ThermometerSun } from 'lucide-react';

import type { WeatherProviderDto, WeatherForecastDto, WeatherCurrentDto } from '@/types/api';

interface WeatherProviderSelectorProps {
  providers: WeatherProviderDto[];
  selected?: string | null;
  onChange: (id: string) => void;
  saving?: boolean;
  current?: WeatherCurrentDto | null;
  forecast?: WeatherForecastDto | null;
  loadingPreview?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatTemp(value?: number | null): string {
  return isFiniteNumber(value) ? `${value.toFixed(1)}°C` : '—';
}

function formatHumidity(value?: number | null): string {
  return isFiniteNumber(value) ? `${Math.round(value)}%` : '—';
}

function translateDescription(icon?: string | null, fallback?: string | null): string | null {
  if (fallback) return fallback;
  const map: Record<string, string> = {
    'clear-day': 'Солнечно',
    'clear-night': 'Ясно',
    'partly-cloudy-day': 'Переменная облачность',
    'partly-cloudy-night': 'Облачно ночью',
    cloudy: 'Облачно',
    rain: 'Дождь',
    drizzle: 'Морось',
    snow: 'Снег',
    fog: 'Туман'
  };
  if (!icon) return null;
  return map[icon] ?? null;
}

function WeatherIcon({ code }: { code?: string | null }) {
  const icon = (code ?? '').toLowerCase();
  const commonClass = 'h-4 w-4 text-ios-accent';
  if (icon.includes('clear') || icon === 'sun') return <Sun className={commonClass} />;
  if (icon.includes('partly')) return <CloudSun className={commonClass} />;
  if (icon.includes('snow')) return <Snowflake className={commonClass} />;
  if (icon.includes('rain') || icon.includes('drizzle')) return <CloudRain className={commonClass} />;
  if (icon.includes('fog')) return <CloudFog className={commonClass} />;
  return <Cloud className={commonClass} />;
}

export function WeatherProviderSelector({
  providers,
  selected,
  onChange,
  saving = false,
  current,
  forecast,
  loadingPreview = false
}: WeatherProviderSelectorProps) {
  const sortedProviders = useMemo(
    () =>
      providers.length
        ? providers
        : [
            { id: 'OPEN_METEO', name: 'Open-Meteo', description: 'Без ключа' },
            { id: 'WEATHERAPI', name: 'WeatherAPI Free', description: 'Публичный ключ на бэкенде' },
            { id: 'TOMORROW', name: 'Tomorrow.io Free', description: 'Публичный ключ на бэкенде' },
            { id: 'OPENWEATHER', name: 'OpenWeatherMap Free', description: 'Публичный ключ на бэкенде' }
          ],
    [providers]
  );

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-ios-subtext">Провайдер (без ключей)</span>
        <select
          value={selected ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
        >
          <option value="" disabled>
            Выберите провайдера
          </option>
          {sortedProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.free === false ? '' : '• free'}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-ios-subtext">Приложение само подтянет ключи, ввод не требуется.</p>
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sortedProviders.map((p) => (
          <motion.div
            key={p.id}
            className={`rounded-2xl border px-3 py-2 text-sm ${
              p.id === selected ? 'border-ios-accent/55 bg-ios-accent/10 text-ios-text' : 'border-ios-border/60 bg-white/60 dark:bg-zinc-950/60'
            }`}
            whileHover={{ scale: 1.01 }}
          >
            <p className="font-semibold">{p.name}</p>
            <p className="text-[12px] text-ios-subtext">{p.description ?? 'Бесплатный tier, готов к работе'}</p>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <div className="mb-2 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-ios-accent" />
          <p className="text-sm font-medium text-ios-text">Предпросмотр погоды</p>
          {loadingPreview ? <span className="text-[11px] text-ios-subtext">Обновляем…</span> : null}
        </div>

        {current ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[12px] text-ios-text dark:bg-zinc-900/60">
              <ThermometerSun className="h-3.5 w-3.5" /> {formatTemp(current.tempC)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[12px] text-ios-text dark:bg-zinc-900/60">
              <Droplets className="h-3.5 w-3.5" /> {formatHumidity(current.humidity)} влажность
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[12px] text-ios-text dark:bg-zinc-900/60">
              <WeatherIcon code={current.icon} />
              {translateDescription(current.icon, current.description) ?? 'Погода'}
            </span>
            <span className="text-[12px] text-ios-subtext">Источник: {current.source ?? '—'}</span>
          </div>
        ) : (
          <p className="text-[12px] text-ios-subtext">Выберите провайдера и город, затем нажмите «Предпросмотр».</p>
        )}

        {forecast?.days?.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {forecast.days.slice(0, 3).map((day) => (
              <div key={day.date} className="rounded-xl border border-ios-border/50 bg-white/60 p-2 text-[12px] dark:bg-zinc-900/60">
                <p className="font-semibold text-ios-text">{day.date}</p>
                <div className="mt-1 flex items-center justify-center gap-1 text-ios-subtext">
                  <WeatherIcon code={day.icon} />
                  <span>{formatTemp(day.tempC)}</span>
                </div>
                {translateDescription(day.icon, day.description) ? (
                  <p className="text-[11px] text-ios-subtext">{translateDescription(day.icon, day.description)}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
